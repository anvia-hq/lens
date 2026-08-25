import { isRecord, labelText, rawTraceJson } from "./trace-detail";

export type SpanPayloadMessage = {
  key: string;
  role: string;
  content: string;
  toolCalls: SpanPayloadTool[];
};

export type SpanPayloadTool = {
  key: string;
  name: string;
  description?: string;
  value: unknown;
};

export type SpanPayloadAnalysis = {
  messages: SpanPayloadMessage[];
  tools: SpanPayloadTool[];
  additional: unknown;
  hasMessages: boolean;
};

const MESSAGE_KEYS = [
  "messages",
  "inputMessages",
  "input_messages",
  "outputMessages",
  "output_messages",
  "chatHistory",
  "chat_history",
  "history",
  "prompt",
  "output",
] as const;
const TOOL_KEYS = ["tools", "functions", "toolSchemas", "tool_schemas"] as const;

export function analyzeSpanPayload(value: unknown): SpanPayloadAnalysis {
  const messages: SpanPayloadMessage[] = [];
  const tools: SpanPayloadTool[] = [];

  if (Array.isArray(value)) {
    const unrecognized: unknown[] = [];
    value.forEach((item, index) => {
      const message = parseMessage(item, `message:${index}`);
      if (message) messages.push(message);
      else unrecognized.push(item);
    });
    return {
      messages,
      tools,
      additional: unrecognized.length > 0 ? unrecognized : undefined,
      hasMessages: messages.length > 0,
    };
  }

  if (!isRecord(value)) {
    return { messages, tools, additional: value, hasMessages: false };
  }

  const directMessage = parseMessage(value, "message:direct");
  if (directMessage) {
    const messageFields = new Set([
      "role",
      "type",
      "content",
      "text",
      "message",
      "result",
      "output",
      "value",
      "tool_calls",
      "toolCalls",
    ]);
    const additionalEntries = Object.entries(value).filter(([key]) => !messageFields.has(key));
    return {
      messages: [directMessage],
      tools,
      additional: additionalEntries.length > 0 ? Object.fromEntries(additionalEntries) : undefined,
      hasMessages: true,
    };
  }

  const consumed = new Set<string>();
  if (typeof value.instructions === "string" && value.instructions.trim()) {
    messages.push({
      key: "instructions",
      role: "system",
      content: value.instructions,
      toolCalls: [],
    });
    consumed.add("instructions");
  }

  for (const key of MESSAGE_KEYS) {
    const candidate = value[key];
    if (!Array.isArray(candidate)) continue;
    const parsed = candidate
      .map((item, index) => parseMessage(item, `${key}:${index}`))
      .filter((message): message is SpanPayloadMessage => message !== undefined);
    if (parsed.length === 0) continue;
    messages.push(...parsed);
    consumed.add(key);
  }

  const choices = value.choices;
  if (Array.isArray(choices)) {
    const parsed = choices
      .map((choice, index) => {
        if (!isRecord(choice)) return undefined;
        return parseMessage(choice.message ?? choice.delta ?? choice, `choice:${index}`);
      })
      .filter((message): message is SpanPayloadMessage => message !== undefined);
    if (parsed.length > 0) {
      messages.push(...parsed);
      consumed.add("choices");
    }
  }

  for (const key of TOOL_KEYS) {
    const candidate = value[key];
    if (!Array.isArray(candidate)) continue;
    const parsed = candidate.map((tool, index) => parseTool(tool, `${key}:${index}`));
    tools.push(...parsed);
    consumed.add(key);
  }

  const additionalEntries = Object.entries(value).filter(([key]) => !consumed.has(key));
  return {
    messages,
    tools,
    additional: additionalEntries.length > 0 ? Object.fromEntries(additionalEntries) : undefined,
    hasMessages: messages.length > 0,
  };
}

export type StructuredEntry = {
  path: string;
  label: string;
  value: unknown;
};

export function flattenStructuredEntries(value: unknown): StructuredEntry[] {
  const entries: StructuredEntry[] = [];
  const visit = (current: unknown, path: string) => {
    if (Array.isArray(current)) {
      if (current.length === 0) entries.push({ path, label: path || "Value", value: current });
      current.forEach((item, index) => {
        visit(item, path ? `${path}.${index}` : String(index));
      });
      return;
    }
    if (isRecord(current)) {
      const nested = Object.entries(current);
      if (nested.length === 0) entries.push({ path, label: path || "Value", value: current });
      nested.forEach(([key, item]) => {
        visit(item, path ? `${path}.${key}` : key);
      });
      return;
    }
    entries.push({
      path,
      label: path ? labelText(path.split(".").at(-1) ?? path) : "Value",
      value: current,
    });
  };
  visit(value, "");
  return entries;
}

export function compactPayloadValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return rawTraceJson(value);
}

function parseMessage(value: unknown, key: string): SpanPayloadMessage | undefined {
  if (!isRecord(value)) return undefined;
  const role = messageRole(value);
  const hasMessageShape =
    role !== undefined &&
    ("content" in value ||
      "text" in value ||
      "message" in value ||
      "output" in value ||
      "value" in value ||
      "tool_calls" in value ||
      "toolCalls" in value ||
      value.type === "tool_call" ||
      value.type === "tool_result");
  if (!hasMessageShape || role === undefined) return undefined;

  const content = messageContent(
    value.content ?? value.text ?? value.message ?? value.result ?? value.output ?? value.value,
  );
  const toolCalls = [
    ...toolCallsFrom(value.tool_calls, `${key}:tool-call`),
    ...toolCallsFrom(value.toolCalls, `${key}:tool-call`),
    ...toolCallsFromContent(value.content, `${key}:content-tool-call`),
  ];
  return { key, role, content, toolCalls };
}

function messageRole(value: Record<string, unknown>): string | undefined {
  if (typeof value.role === "string") return value.role.toLowerCase();
  if (typeof value.type !== "string") return undefined;
  if (
    ["reasoning", "tool_call", "server_tool_call", "tool_result", "server_tool_result"].includes(
      value.type,
    )
  ) {
    return value.type === "reasoning" ? "reasoning" : "tool";
  }
  return undefined;
}

function messageContent(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!isRecord(item)) return messageContent(item);
        if (isToolCall(item)) return "";
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        if (item.type === "image" || item.type === "image_url") return "[Image]";
        if (item.type === "file") return "[File]";
        if (item.type === "audio") return "[Audio]";
        return compactPayloadValue(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
  }
  return compactPayloadValue(value);
}

function toolCallsFrom(value: unknown, key: string): SpanPayloadTool[] {
  if (!Array.isArray(value)) return [];
  return value.map((tool, index) => parseTool(tool, `${key}:${index}`));
}

function toolCallsFromContent(value: unknown, key: string): SpanPayloadTool[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => isRecord(item) && isToolCall(item))
    .map((tool, index) => parseTool(tool, `${key}:${index}`));
}

function parseTool(value: unknown, key: string): SpanPayloadTool {
  if (!isRecord(value)) return { key, name: "Tool", value };
  const fn = isRecord(value.function) ? value.function : undefined;
  const name =
    (typeof value.name === "string" && value.name) ||
    (typeof fn?.name === "string" && fn.name) ||
    (typeof value.type === "string" && labelText(value.type)) ||
    "Tool";
  const description =
    (typeof value.description === "string" && value.description) ||
    (typeof fn?.description === "string" && fn.description) ||
    undefined;
  const payload =
    fn?.arguments ?? value.arguments ?? value.input ?? value.result ?? value.output ?? value;
  return { key, name, description, value: parseJsonString(payload) };
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isToolCall(value: Record<string, unknown>): boolean {
  return ["tool_call", "server_tool_call", "tool_result", "server_tool_result"].includes(
    String(value.type),
  );
}
