import type { JsonValue } from "@lens/contracts";
import type {
  OtlpEvent,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpLink,
  OtlpResourceSpans,
  OtlpScopeSpans,
  OtlpSpan,
} from "./types.js";

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const number = (value: unknown): number =>
  typeof value === "number" ? value : typeof value === "string" ? Number(value) || 0 : 0;

function anyValue(value: unknown): JsonValue {
  const source = record(value);
  if ("stringValue" in source) return text(source.stringValue);
  if ("boolValue" in source) return Boolean(source.boolValue);
  if ("intValue" in source) {
    const raw = text(source.intValue) || String(source.intValue ?? 0);
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) ? parsed : raw;
  }
  if ("doubleValue" in source) return number(source.doubleValue);
  if ("bytesValue" in source) return text(source.bytesValue);
  if ("arrayValue" in source) {
    return array(record(source.arrayValue).values).map(anyValue);
  }
  if ("kvlistValue" in source) {
    return Object.fromEntries(
      array(record(source.kvlistValue).values).map((item) => {
        const decoded = keyValue(item);
        return [decoded.key, decoded.value];
      }),
    );
  }
  return null;
}

function keyValue(value: unknown): OtlpKeyValue {
  const source = record(value);
  return { key: text(source.key), value: anyValue(source.value) };
}

function event(value: unknown): OtlpEvent {
  const source = record(value);
  return {
    timeUnixNano: text(source.timeUnixNano) || String(source.timeUnixNano ?? 0),
    name: text(source.name),
    attributes: array(source.attributes).map(keyValue),
    droppedAttributesCount: number(source.droppedAttributesCount),
  };
}

function link(value: unknown): OtlpLink {
  const source = record(value);
  return {
    traceId: text(source.traceId).toLowerCase(),
    spanId: text(source.spanId).toLowerCase(),
    traceState: text(source.traceState),
    attributes: array(source.attributes).map(keyValue),
    droppedAttributesCount: number(source.droppedAttributesCount),
    flags: number(source.flags),
  };
}

function span(value: unknown): OtlpSpan {
  const source = record(value);
  const status = record(source.status);
  return {
    traceId: text(source.traceId).toLowerCase(),
    spanId: text(source.spanId).toLowerCase(),
    parentSpanId: text(source.parentSpanId).toLowerCase(),
    traceState: text(source.traceState),
    flags: number(source.flags),
    name: text(source.name),
    kind: number(source.kind),
    startTimeUnixNano: text(source.startTimeUnixNano) || String(source.startTimeUnixNano ?? 0),
    endTimeUnixNano: text(source.endTimeUnixNano) || String(source.endTimeUnixNano ?? 0),
    attributes: array(source.attributes).map(keyValue),
    events: array(source.events).map(event),
    links: array(source.links).map(link),
    status: { code: number(status.code), message: text(status.message) },
  };
}

function scopeSpans(value: unknown): OtlpScopeSpans {
  const source = record(value);
  const scope = record(source.scope);
  return {
    scope: {
      name: text(scope.name),
      version: text(scope.version),
      attributes: array(scope.attributes).map(keyValue),
    },
    spans: array(source.spans).map(span),
    schemaUrl: text(source.schemaUrl),
  };
}

function resourceSpans(value: unknown): OtlpResourceSpans {
  const source = record(value);
  const resource = record(source.resource);
  return {
    resource: { attributes: array(resource.attributes).map(keyValue) },
    scopeSpans: array(source.scopeSpans ?? source.instrumentationLibrarySpans).map(scopeSpans),
    schemaUrl: text(source.schemaUrl),
  };
}

export function decodeJsonRequest(bytes: Uint8Array): OtlpExportRequest {
  const source = record(JSON.parse(new TextDecoder().decode(bytes)));
  return { resourceSpans: array(source.resourceSpans).map(resourceSpans) };
}
