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

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
