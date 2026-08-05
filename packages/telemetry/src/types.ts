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
