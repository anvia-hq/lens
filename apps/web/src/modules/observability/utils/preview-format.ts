export type StructuredPreviewField = {
  key: string;
  value: string;
};

/**
 * Formats a raw span preview string into a clean, single-line human summary for
 * compact step rows (strips raw OpenAI/Anvia reasoning & tool-call envelope noise).
 */
export function formatStepOneLine(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  const parsed = tryParseJson(trimmed);
  if (parsed !== undefined) {
    const formatted = summarizeParsedJson(parsed);
    if (formatted) return formatted;
  }

  // Handle truncated JSON previews from ClickHouse (e.g. `[{"type":"reasoning","text":"","id":"...`
  // or `{"type":"tool-call","toolCallId":"...","toolName":"tavily_search","input":{"query":"..."`).
  const truncatedTool = formatTruncatedToolCall(trimmed);
  if (truncatedTool) return truncatedTool;

  if (/^\[\s*\{\s*"type"\s*:\s*"reasoning"/.test(trimmed)) {
    const textMatch =
      /"type"\s*:\s*"(?:text|output_text)"[^}]*"text"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(trimmed);
    if (textMatch?.[1]) return unescapeJsonString(textMatch[1]);
    const reasoningMatch = /"text"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(trimmed);
    if (reasoningMatch?.[1]) return unescapeJsonString(reasoningMatch[1]);
    return "Reasoning";
  }

  const fields = extractStructuredPreviewFields(trimmed, 3);
  if (fields && fields.length > 0) {
    return fields.map((field) => `${field.key}: ${field.value}`).join(" · ");
  }

  return trimmed.replace(/\s+/g, " ");
}

/**
 * Extracts clean top-level key/value pairs from complete or truncated JSON objects
 * so structured outputs render as scannable fields instead of minified JSON walls.
 */
export function extractStructuredPreviewFields(
  raw: string,
  maxFields = 4,
): StructuredPreviewField[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;

  const parsed = tryParseJson(trimmed);
  if (parsed !== undefined && isRecord(parsed)) {
    // Don't treat a single tool-call envelope as arbitrary structured fields
    if (typeof parsed.type === "string" && isToolCallType(parsed.type)) return null;
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;
    return entries.slice(0, maxFields).map(([key, value]) => ({
      key,
      value: compactJsonValue(value),
    }));
  }

  // Fallback parser for truncated JSON objects: `"key":"value"` / `"key":123` / `"key":true`
  if (/^\{\s*"type"\s*:\s*"(?:tool-call|tool_call|function_call)"/.test(trimmed)) {
    return null;
  }

  const fields: StructuredPreviewField[] = [];
  const pairRe =
    /"([a-zA-Z0-9_.-]+)"\s*:\s*(?:"((?:[^"\\]|\\.)*)(?:"|$)|(true|false|null|-?\d+(?:\.\d+)?))/g;
  for (const match of trimmed.matchAll(pairRe)) {
    const key = match[1];
    if (!key) continue;
    const rawValue = match[2] !== undefined ? unescapeJsonString(match[2]) : (match[3] ?? "");
    if (rawValue.trim().length === 0) continue;
    fields.push({ key, value: rawValue.trim() });
    if (fields.length >= maxFields) break;
  }

  return fields.length > 0 ? fields : null;
}

function summarizeParsedJson(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const texts: string[] = [];
    const tools: string[] = [];
    let sawReasoning = false;
    for (const item of value) {
      if (!isRecord(item)) continue;
      const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
      if (isToolCallType(type)) {
        const formatted = formatToolCallRecord(item);
        if (formatted) tools.push(formatted);
        continue;
      }
      if (type === "reasoning") {
        sawReasoning = true;
        if (typeof item.text === "string" && item.text.trim()) texts.push(item.text.trim());
        continue;
      }
      if (typeof item.text === "string" && item.text.trim()) texts.push(item.text.trim());
      else if (typeof item.content === "string" && item.content.trim()) {
        texts.push(item.content.trim());
      }
    }
    if (texts.length > 0) return texts.join(" ");
    if (tools.length > 0) return tools.join(", ");
    if (sawReasoning) return "Reasoning";
    return null;
  }
  if (isRecord(value)) {
    const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
    if (isToolCallType(type)) return formatToolCallRecord(value);
    const entries = Object.entries(value);
    if (entries.length === 0) return null;
    return entries
      .slice(0, 3)
      .map(([key, item]) => `${key}: ${compactJsonValue(item)}`)
      .join(" · ");
  }
  return null;
}

function formatToolCallRecord(record: Record<string, unknown>): string | null {
  const name =
    typeof record.toolName === "string"
      ? record.toolName
      : typeof record.name === "string"
        ? record.name
        : isRecord(record.function) && typeof record.function.name === "string"
          ? record.function.name
          : null;
  if (!name) return null;
  const rawArgs =
    record.input ??
    record.arguments ??
    record.args ??
    (isRecord(record.function) ? record.function.arguments : undefined);
  if (rawArgs === undefined || rawArgs === null) return `${name}()`;
  if (typeof rawArgs === "string") {
    const trimmed = rawArgs.trim();
    return trimmed ? `${name}(${trimmed})` : `${name}()`;
  }
  if (isRecord(rawArgs)) {
    const entries = Object.entries(rawArgs)
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${compactJsonValue(value)}`);
    return entries.length > 0 ? `${name}(${entries.join(", ")})` : `${name}()`;
  }
  return `${name}(${compactJsonValue(rawArgs)})`;
}

function formatTruncatedToolCall(raw: string): string | null {
  if (!/"type"\s*:\s*"(?:tool-call|tool_call|function_call)"/.test(raw)) return null;
  const nameMatch = /"(?:toolName|name)"\s*:\s*"([^"]+)"/.exec(raw);
  const name = nameMatch?.[1];
  if (!name) return null;
  const queryMatch = /"(?:query|url|path|prompt|id|input)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(raw);
  if (queryMatch?.[1]) {
    return `${name}("${unescapeJsonString(queryMatch[1])}")`;
  }
  return `${name}(…)`;
}

function isToolCallType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower === "tool-call" || lower === "tool_call" || lower === "function_call";
}

function compactJsonValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return entries
      .slice(0, 2)
      .map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`)
      .join(", ");
  }
  return String(value);
}

function tryParseJson(value: string): unknown {
  if (!value.startsWith("{") && !value.startsWith("[")) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
