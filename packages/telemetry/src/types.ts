import type { JsonValue } from "@lens/contracts";

export type OtlpKeyValue = { key: string; value: JsonValue };

export type OtlpEvent = {
  timeUnixNano: string;
  name: string;
  attributes: OtlpKeyValue[];
  droppedAttributesCount: number;
};

export type OtlpLink = {
  traceId: string;
  spanId: string;
  traceState: string;
  attributes: OtlpKeyValue[];
  droppedAttributesCount: number;
  flags: number;
};

export type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  traceState: string;
  flags: number;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  events: OtlpEvent[];
  links: OtlpLink[];
  status: { code: number; message: string };
};

export type OtlpScopeSpans = {
  scope: { name: string; version: string; attributes: OtlpKeyValue[] };
  spans: OtlpSpan[];
  schemaUrl: string;
};

export type OtlpResourceSpans = {
  resource: { attributes: OtlpKeyValue[] };
  scopeSpans: OtlpScopeSpans[];
  schemaUrl: string;
};

export type OtlpExportRequest = { resourceSpans: OtlpResourceSpans[] };

export type OtlpLogRecord = {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: JsonValue;
  attributes: OtlpKeyValue[];
  droppedAttributesCount: number;
  flags: number;
  traceId: string;
  spanId: string;
  eventName: string;
};

export type OtlpScopeLogs = {
  scope: { name: string; version: string; attributes: OtlpKeyValue[] };
  logRecords: OtlpLogRecord[];
  schemaUrl: string;
};

export type OtlpResourceLogs = {
  resource: { attributes: OtlpKeyValue[] };
  scopeLogs: OtlpScopeLogs[];
  schemaUrl: string;
};

export type OtlpLogsExportRequest = { resourceLogs: OtlpResourceLogs[] };
