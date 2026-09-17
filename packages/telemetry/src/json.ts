import type { JsonValue } from "@lens/contracts";
import type {
  OtlpEvent,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpLink,
  OtlpLogRecord,
  OtlpLogsExportRequest,
  OtlpResourceLogs,
  OtlpResourceSpans,
  OtlpScopeSpans,
  OtlpSpan,
} from "./types.js";

type RecordValue = Record<string, unknown>;

const ANY_VALUE_KEYS = [
  "stringValue",
  "boolValue",
  "intValue",
  "doubleValue",
  "bytesValue",
  "arrayValue",
  "kvlistValue",
] as const;

function requiredRecord(value: unknown, label: string): RecordValue {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as RecordValue;
  }
  throw new TypeError(`${label} must be an object`);
}

function optionalRecord(value: unknown, label: string): RecordValue {
  return value === undefined ? {} : requiredRecord(value, label);
}

function optionalArray(value: unknown, label: string): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  throw new TypeError(`${label} must be an array`);
}

function optionalText(value: unknown, label: string): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  throw new TypeError(`${label} must be a string`);
}

function optionalUnsignedInteger(value: unknown, label: string): number {
  if (value === undefined) return 0;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function optionalUnixNano(value: unknown, label: string): string {
  if (value === undefined) return "0";
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new TypeError(`${label} must be an unsigned integer string`);
}

function anyValue(value: unknown, label: string): JsonValue {
  const source = requiredRecord(value, label);
  const presentKeys = ANY_VALUE_KEYS.filter((key) => source[key] !== undefined);
  if (presentKeys.length > 1) throw new TypeError(`${label} must contain exactly one value`);

  const [key] = presentKeys;
  if (key === undefined) return null;
  if (key === "stringValue") return optionalText(source.stringValue, `${label}.stringValue`);
  if (key === "boolValue") {
    if (typeof source.boolValue !== "boolean") {
      throw new TypeError(`${label}.boolValue must be a boolean`);
    }
    return source.boolValue;
  }
  if (key === "intValue") {
    const raw = source.intValue;
    if (
      !(
        (typeof raw === "string" && /^-?\d+$/.test(raw)) ||
        (typeof raw === "number" && Number.isSafeInteger(raw))
      )
    ) {
      throw new TypeError(`${label}.intValue must be an integer string`);
    }
    const text = String(raw);
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : text;
  }
  if (key === "doubleValue") {
    const raw = source.doubleValue;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim().length > 0
          ? Number(raw)
          : Number.NaN;
    if (!Number.isFinite(parsed)) throw new TypeError(`${label}.doubleValue must be finite`);
    return parsed;
  }
  if (key === "bytesValue") return optionalText(source.bytesValue, `${label}.bytesValue`);
  if (key === "arrayValue") {
    const arrayValue = requiredRecord(source.arrayValue, `${label}.arrayValue`);
    return optionalArray(arrayValue.values, `${label}.arrayValue.values`).map((item, index) =>
      anyValue(item, `${label}.arrayValue.values[${index}]`),
    );
  }

  const list = requiredRecord(source.kvlistValue, `${label}.kvlistValue`);
  return Object.fromEntries(
    optionalArray(list.values, `${label}.kvlistValue.values`).map((item, index) => {
      const decoded = keyValue(item, `${label}.kvlistValue.values[${index}]`);
      return [decoded.key, decoded.value];
    }),
  );
}

function keyValue(value: unknown, label: string): OtlpKeyValue {
  const source = requiredRecord(value, label);
  return {
    key: optionalText(source.key, `${label}.key`),
    value: source.value === undefined ? null : anyValue(source.value, `${label}.value`),
  };
}

function keyValues(value: unknown, label: string): OtlpKeyValue[] {
  return optionalArray(value, label).map((item, index) => keyValue(item, `${label}[${index}]`));
}

function event(value: unknown, label: string): OtlpEvent {
  const source = requiredRecord(value, label);
  return {
    timeUnixNano: optionalUnixNano(source.timeUnixNano, `${label}.timeUnixNano`),
    name: optionalText(source.name, `${label}.name`),
    attributes: keyValues(source.attributes, `${label}.attributes`),
    droppedAttributesCount: optionalUnsignedInteger(
      source.droppedAttributesCount,
      `${label}.droppedAttributesCount`,
    ),
  };
}

function link(value: unknown, label: string): OtlpLink {
  const source = requiredRecord(value, label);
  return {
    traceId: optionalText(source.traceId, `${label}.traceId`).toLowerCase(),
    spanId: optionalText(source.spanId, `${label}.spanId`).toLowerCase(),
    traceState: optionalText(source.traceState, `${label}.traceState`),
    attributes: keyValues(source.attributes, `${label}.attributes`),
    droppedAttributesCount: optionalUnsignedInteger(
      source.droppedAttributesCount,
      `${label}.droppedAttributesCount`,
    ),
    flags: optionalUnsignedInteger(source.flags, `${label}.flags`),
  };
}

function span(value: unknown, label: string): OtlpSpan {
  const source = requiredRecord(value, label);
  const status = optionalRecord(source.status, `${label}.status`);
  return {
    traceId: optionalText(source.traceId, `${label}.traceId`).toLowerCase(),
    spanId: optionalText(source.spanId, `${label}.spanId`).toLowerCase(),
    parentSpanId: optionalText(source.parentSpanId, `${label}.parentSpanId`).toLowerCase(),
    traceState: optionalText(source.traceState, `${label}.traceState`),
    flags: optionalUnsignedInteger(source.flags, `${label}.flags`),
    name: optionalText(source.name, `${label}.name`),
    kind: optionalUnsignedInteger(source.kind, `${label}.kind`),
    startTimeUnixNano: optionalUnixNano(source.startTimeUnixNano, `${label}.startTimeUnixNano`),
    endTimeUnixNano: optionalUnixNano(source.endTimeUnixNano, `${label}.endTimeUnixNano`),
    attributes: keyValues(source.attributes, `${label}.attributes`),
    events: optionalArray(source.events, `${label}.events`).map((item, index) =>
      event(item, `${label}.events[${index}]`),
    ),
    links: optionalArray(source.links, `${label}.links`).map((item, index) =>
      link(item, `${label}.links[${index}]`),
    ),
    status: {
      code: optionalUnsignedInteger(status.code, `${label}.status.code`),
      message: optionalText(status.message, `${label}.status.message`),
    },
  };
}

function scope(value: unknown, label: string): OtlpScopeSpans["scope"] {
  const source = optionalRecord(value, label);
  return {
    name: optionalText(source.name, `${label}.name`),
    version: optionalText(source.version, `${label}.version`),
    attributes: keyValues(source.attributes, `${label}.attributes`),
  };
}

function scopeSpans(value: unknown, label: string): OtlpScopeSpans {
  const source = requiredRecord(value, label);
  return {
    scope: scope(source.scope, `${label}.scope`),
    spans: optionalArray(source.spans, `${label}.spans`).map((item, index) =>
      span(item, `${label}.spans[${index}]`),
    ),
    schemaUrl: optionalText(source.schemaUrl, `${label}.schemaUrl`),
  };
}

function resourceAttributes(value: unknown, label: string): { attributes: OtlpKeyValue[] } {
  const resource = optionalRecord(value, label);
  return { attributes: keyValues(resource.attributes, `${label}.attributes`) };
}

function resourceSpans(value: unknown, label: string): OtlpResourceSpans {
  const source = requiredRecord(value, label);
  const scopes = source.scopeSpans ?? source.instrumentationLibrarySpans;
  return {
    resource: resourceAttributes(source.resource, `${label}.resource`),
    scopeSpans: optionalArray(scopes, `${label}.scopeSpans`).map((item, index) =>
      scopeSpans(item, `${label}.scopeSpans[${index}]`),
    ),
    schemaUrl: optionalText(source.schemaUrl, `${label}.schemaUrl`),
  };
}

export function decodeJsonRequest(bytes: Uint8Array): OtlpExportRequest {
  const source = requiredRecord(parseJson(bytes), "OTLP trace request");
  return {
    resourceSpans: optionalArray(source.resourceSpans, "resourceSpans").map((item, index) =>
      resourceSpans(item, `resourceSpans[${index}]`),
    ),
  };
}

function logRecord(value: unknown, label: string): OtlpLogRecord {
  const source = requiredRecord(value, label);
  return {
    timeUnixNano: optionalUnixNano(source.timeUnixNano, `${label}.timeUnixNano`),
    observedTimeUnixNano: optionalUnixNano(
      source.observedTimeUnixNano,
      `${label}.observedTimeUnixNano`,
    ),
    severityNumber: optionalUnsignedInteger(source.severityNumber, `${label}.severityNumber`),
    severityText: optionalText(source.severityText, `${label}.severityText`),
    body: source.body === undefined ? null : anyValue(source.body, `${label}.body`),
    attributes: keyValues(source.attributes, `${label}.attributes`),
    droppedAttributesCount: optionalUnsignedInteger(
      source.droppedAttributesCount,
      `${label}.droppedAttributesCount`,
    ),
    flags: optionalUnsignedInteger(source.flags, `${label}.flags`),
    traceId: optionalText(source.traceId, `${label}.traceId`).toLowerCase(),
    spanId: optionalText(source.spanId, `${label}.spanId`).toLowerCase(),
    eventName: optionalText(source.eventName, `${label}.eventName`),
  };
}

function resourceLogs(value: unknown, label: string): OtlpResourceLogs {
  const source = requiredRecord(value, label);
  const scopes = source.scopeLogs ?? source.instrumentationLibraryLogs;
  return {
    resource: resourceAttributes(source.resource, `${label}.resource`),
    scopeLogs: optionalArray(scopes, `${label}.scopeLogs`).map((entry, index) => {
      const scopeLabel = `${label}.scopeLogs[${index}]`;
      const scopeSource = requiredRecord(entry, scopeLabel);
      return {
        scope: scope(scopeSource.scope, `${scopeLabel}.scope`),
        logRecords: optionalArray(scopeSource.logRecords, `${scopeLabel}.logRecords`).map(
          (item, recordIndex) => logRecord(item, `${scopeLabel}.logRecords[${recordIndex}]`),
        ),
        schemaUrl: optionalText(scopeSource.schemaUrl, `${scopeLabel}.schemaUrl`),
      };
    }),
    schemaUrl: optionalText(source.schemaUrl, `${label}.schemaUrl`),
  };
}

export function decodeJsonLogsRequest(bytes: Uint8Array): OtlpLogsExportRequest {
  const source = requiredRecord(parseJson(bytes), "OTLP logs request");
  return {
    resourceLogs: optionalArray(source.resourceLogs, "resourceLogs").map((item, index) =>
      resourceLogs(item, `resourceLogs[${index}]`),
    ),
  };
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
