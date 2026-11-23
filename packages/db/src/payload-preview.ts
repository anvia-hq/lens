import type { JsonValue } from "@lens/contracts";

const INPUT_PREFERRED_KEYS = [
  "prompt",
  "question",
  "input",
  "query",
  "messages",
  "inputMessages",
  "input_messages",
  "chatHistory",
  "chat_history",
  "history",
  "arguments",
  "content",
  "text",
  "message",
  "value",
] as const;

const OUTPUT_PREFERRED_KEYS = [
  "response",
  "output",
  "result",
  "choices",
  "choice",
  "outputMessages",
  "output_messages",
  "messages",
  "message",
  "content",
  "text",
  "value",
] as const;

export function extractPayloadPreview(
  raw: string | null | undefined,
  direction: "input" | "output",
  maxLength = 240,
): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let text: string;
  try {
    const parsed = JSON.parse(trimmed) as JsonValue;
    text = extractValueText(parsed, direction);
  } catch {
    text = extractFallbackText(trimmed, direction);
  }

  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) return null;
  return clipText(normalized, maxLength);
}

function extractValueText(value: JsonValue, direction: "input" | "output"): string {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    const contentPartText = extractContentPartsText(value);
    if (contentPartText !== null) return contentPartText;

    const targetRole = direction === "input" ? "user" : "assistant";
    const matching = [...value]
      .reverse()
      .find(
        (item) =>
          isRecord(item) && typeof item.role === "string" && item.role.toLowerCase() === targetRole,
      );
    if (matching !== undefined) {
      const extracted = extractValueText(matching, direction);
      if (extracted.length > 0) return extracted;
    }
    const candidate =
      direction === "input"
        ? (value.find(
            (item) =>
              !isRecord(item) ||
              typeof item.role !== "string" ||
              item.role.toLowerCase() !== "system",
          ) ?? value[0])
        : value.at(-1);
    return candidate === undefined ? "" : extractValueText(candidate, direction);
  }

  const singlePartText = extractSingleContentPart(value);
  if (singlePartText !== null) return singlePartText;

  const role = typeof value.role === "string" ? value.role.toLowerCase() : undefined;
  const targetRole = direction === "input" ? "user" : "assistant";
  if (role === targetRole && value.content !== undefined) {
    const extracted = extractValueText(value.content, direction);
    if (extracted.length > 0) return extracted;
  }

  if (Array.isArray(value.choices)) {
    for (const choice of value.choices) {
      if (!isRecord(choice)) continue;
      const message = choice.message ?? choice.delta ?? choice;
      const extracted = extractValueText(message, direction);
      if (extracted.length > 0) return extracted;
    }
  }

  const preferredKeys = direction === "input" ? INPUT_PREFERRED_KEYS : OUTPUT_PREFERRED_KEYS;
  for (const key of preferredKeys) {
    const nested = value[key];
    if (nested === undefined || nested === null) continue;
    const extracted = extractValueText(nested, direction);
    if (extracted.length > 0) return extracted;
  }

  return JSON.stringify(value);
}

function extractFallbackText(raw: string, direction: "input" | "output"): string {
  const keys =
    direction === "input"
      ? ["prompt", "question", "content", "input", "query", "text"]
      : ["response", "output", "result", "content", "text", "message"];
  for (const key of keys) {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(raw);
    const captured = match?.[1];
    if (captured && captured.trim().length > 0) {
      return unescapeJsonFragment(captured);
    }
  }
  return raw;
}

function unescapeJsonFragment(value: string): string {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function extractContentPartsText(items: JsonValue[]): string | null {
  const partItems = items.filter((item): item is Record<string, JsonValue> => {
    if (!isRecord(item) || typeof item.type !== "string") return false;
    return isContentPartType(item.type);
  });
  if (partItems.length === 0) return null;

  const textParts: string[] = [];
  const toolParts: string[] = [];
  const reasoningParts: string[] = [];

  for (const part of partItems) {
    const type = String(part.type).toLowerCase();
    if (type === "tool-call" || type === "tool_call" || type === "function_call") {
      const summary = formatToolCallPart(part);
      if (summary) toolParts.push(summary);
      continue;
    }
    if (type === "reasoning") {
      const summary = extractReasoningPartText(part);
      if (summary) reasoningParts.push(summary);
      continue;
    }
    const text = extractTextPart(part);
    if (text) textParts.push(text);
  }

  if (textParts.length > 0) return textParts.join("\n");
  if (toolParts.length > 0) return toolParts.join(", ");
  if (reasoningParts.length > 0) return reasoningParts.join("\n");
  return "Reasoning";
}

function extractSingleContentPart(value: Record<string, JsonValue>): string | null {
  if (typeof value.type !== "string" || !isContentPartType(value.type)) return null;
  return extractContentPartsText([value]);
}

function isContentPartType(type: string): boolean {
  const lower = type.toLowerCase();
  return (
    lower === "text" ||
    lower === "output_text" ||
    lower === "input_text" ||
    lower === "reasoning" ||
    lower === "tool-call" ||
    lower === "tool_call" ||
    lower === "function_call"
  );
}

function extractTextPart(part: Record<string, JsonValue>): string {
  for (const key of ["text", "content", "value"] as const) {
    const candidate = part[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}

function extractReasoningPartText(part: Record<string, JsonValue>): string {
  if (typeof part.text === "string" && part.text.trim().length > 0) return part.text.trim();
  if (typeof part.reasoning === "string" && part.reasoning.trim().length > 0) {
    return part.reasoning.trim();
  }
  if (Array.isArray(part.summary)) {
    const joined = part.summary
      .map((item) =>
        isRecord(item) ? extractTextPart(item) : typeof item === "string" ? item : "",
      )
      .filter(Boolean)
      .join(" ");
    if (joined.length > 0) return joined;
  }
  return "";
}

function formatToolCallPart(part: Record<string, JsonValue>): string {
  const name =
    typeof part.toolName === "string"
      ? part.toolName
      : typeof part.name === "string"
        ? part.name
        : isRecord(part.function) && typeof part.function.name === "string"
          ? part.function.name
          : "tool";
  const rawArgs =
    part.input ??
    part.arguments ??
    part.args ??
    (isRecord(part.function) ? part.function.arguments : undefined);
  if (rawArgs === undefined || rawArgs === null) return `${name}()`;
  if (typeof rawArgs === "string") {
    const trimmed = rawArgs.trim();
    return trimmed.length > 0 ? `${name}(${trimmed})` : `${name}()`;
  }
  if (isRecord(rawArgs)) {
    const entries = Object.entries(rawArgs)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    return entries.length > 0 ? `${name}(${entries.join(", ")})` : `${name}()`;
  }
  return `${name}(${JSON.stringify(rawArgs)})`;
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
