import type { JsonValue } from "@lens/contracts";
export function extractSessionMessageText(
  value: JsonValue,
  direction: "user" | "assistant",
): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "";
  if (Array.isArray(value)) {
    const matching = [...value]
      .reverse()
      .find(
        (item) =>
          isRecord(item) && typeof item.role === "string" && item.role.toLowerCase() === direction,
      );
    return extractSessionMessageText(matching ?? value.at(-1) ?? null, direction);
  }

  const role = typeof value.role === "string" ? value.role.toLowerCase() : undefined;
  if (role === direction && value.content !== undefined) {
    return extractSessionMessageText(value.content, direction);
  }
  const preferredKeys =
    direction === "user"
      ? ["prompt", "question", "input", "messages", "history", "chatHistory"]
      : ["choice", "response", "output", "result", "message", "content", "text"];
  for (const key of preferredKeys) {
    const nested = value[key];
    if (nested !== undefined && nested !== null) {
      const text = extractSessionMessageText(nested, direction);
      if (text.length > 0) return text;
    }
  }
  for (const key of ["content", "text", "message", "value"] as const) {
    const nested = value[key];
    if (nested !== undefined && nested !== null) {
      const text = extractSessionMessageText(nested, direction);
      if (text.length > 0) return text;
    }
  }
  return JSON.stringify(value, null, 2);
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
    value,
  );
}

export function formatDuration(value: number): string {
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}

export function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
