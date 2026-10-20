import type { OtlpSpan } from "./types.js";

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;
const ZERO_ID_PATTERN = /^0+$/;

// ClickHouse DateTime64(9) stores nanoseconds in an Int64, so valid instants run
// from the epoch up to 2262-04-11T23:47:16.854775807Z. Anything outside that
// range throws in nanoToClickHouse (or fails the insert) after the exporter
// already received a 200, failing the whole batch.
const MIN_TIMESTAMP_NANO = 0n;
const MAX_TIMESTAMP_NANO = 9_223_372_036_854_775_807n;

export function validateSpan(span: OtlpSpan): string | undefined {
  if (!validTraceId(span.traceId)) {
    return `Invalid trace ID for span ${displaySpanName(span.name)}`;
  }
  if (!validSpanId(span.spanId)) {
    return `Invalid span ID for span ${displaySpanName(span.name)}`;
  }
  try {
    const start = BigInt(span.startTimeUnixNano);
    const end = BigInt(span.endTimeUnixNano);
    if (start <= MIN_TIMESTAMP_NANO || end < start) {
      return `Invalid timestamps for span ${span.spanId}`;
    }
    if (start > MAX_TIMESTAMP_NANO || end > MAX_TIMESTAMP_NANO) {
      return `Invalid timestamps for span ${span.spanId}`;
    }
  } catch {
    return `Invalid timestamps for span ${span.spanId}`;
  }
  return undefined;
}

export function validTraceId(value: string): boolean {
  return TRACE_ID_PATTERN.test(value) && !ZERO_ID_PATTERN.test(value);
}

export function validSpanId(value: string): boolean {
  return SPAN_ID_PATTERN.test(value) && !ZERO_ID_PATTERN.test(value);
}

export function nullableValidTraceId(value: string | null): string | null {
  const normalized = value?.toLowerCase() ?? null;
  return normalized !== null && validTraceId(normalized) ? normalized : null;
}

export function nullableValidSpanId(value: string | null): string | null {
  const normalized = value?.toLowerCase() ?? null;
  return normalized !== null && validSpanId(normalized) ? normalized : null;
}

function displaySpanName(name: string): string {
  const normalized = name.length === 0 ? "<unnamed>" : name;
  return normalized.length <= 128 ? normalized : `${normalized.slice(0, 125)}...`;
}
