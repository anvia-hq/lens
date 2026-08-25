import type { JsonValue } from "@lens/contracts";

const MAX_FIELD_BYTES = 64 * 1024;
const DEFAULT_RESPONSE_BUDGET = 220 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024;

export type TruncatedPayload = {
  truncated: true;
  byteLength: number;
  preview: string;
};

export class PayloadBudget {
  private remaining: number;

  constructor(totalBytes = DEFAULT_RESPONSE_BUDGET) {
    this.remaining = totalBytes;
  }

  include(value: JsonValue | undefined): JsonValue | TruncatedPayload | null {
    if (value === undefined) return null;
    const serialized = JSON.stringify(value);
    const byteLength = Buffer.byteLength(serialized);
    if (byteLength <= MAX_FIELD_BYTES && byteLength <= this.remaining) {
      this.remaining -= byteLength;
      return value;
    }
    const previewLimit = Math.max(0, Math.min(MAX_PREVIEW_BYTES, this.remaining));
    const preview = utf8Preview(serialized, previewLimit);
    this.remaining = Math.max(0, this.remaining - Buffer.byteLength(preview));
    return { truncated: true, byteLength, preview };
  }
}

export function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function utf8Preview(value: string, maxBytes: number): string {
  if (maxBytes === 0) return "";
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) return value;
  return bytes
    .subarray(0, maxBytes)
    .toString("utf8")
    .replace(/\uFFFD$/, "");
}
