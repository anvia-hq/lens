import { z } from "zod";
import { jobSchemaVersion } from "./job-schema.js";
import type { FacetValue } from "./shared.js";

export const observationKinds = [
  "span",
  "generation",
  "event",
  "embedding",
  "agent",
  "tool",
  "chain",
  "retriever",
  "evaluator",
  "guardrail",
] as const;
export type ObservationKind = (typeof observationKinds)[number];

export const spanStatuses = ["unset", "ok", "error"] as const;
export type SpanStatus = (typeof spanStatuses)[number];

const jsonRecordSchema = z.record(z.string(), z.json());
const nonnegativeInteger = z.number().int().nonnegative();

export const normalizedSpanSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/i),
  spanId: z.string().regex(/^[0-9a-f]{16}$/i),
  parentSpanId: z
    .string()
    .regex(/^[0-9a-f]{16}$/i)
    .nullable(),
  traceState: z.string(),
  name: z.string(),
  kind: z.number().int(),
  observationKind: z.enum(observationKinds),
  status: z.enum(spanStatuses),
  statusMessage: z.string(),
  startTimeUnixNano: z.string().regex(/^\d+$/),
  endTimeUnixNano: z.string().regex(/^\d+$/),
  durationNano: z.string().regex(/^\d+$/),
  serviceName: z.string(),
  scopeName: z.string(),
  scopeVersion: z.string(),
  resourceAttributes: jsonRecordSchema,
  spanAttributes: jsonRecordSchema,
  events: z.array(z.json()),
  links: z.array(z.json()),
  traceName: z.string().nullable(),
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  tags: z.array(z.string()),
  version: z.string().nullable(),
  environment: z.string(),
  release: z.string().nullable(),
  serviceVersion: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: nonnegativeInteger,
  cachedInputTokens: nonnegativeInteger,
  outputTokens: nonnegativeInteger,
  totalTokens: nonnegativeInteger,
  inputCost: z.number().nonnegative().nullable(),
  outputCost: z.number().nonnegative().nullable(),
  totalCost: z.number().nonnegative().nullable(),
  input: z.json().nullable(),
  output: z.json().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  ingestedAt: z.iso.datetime(),
  ingestVersion: z.string(),
});
export type NormalizedSpan = z.infer<typeof normalizedSpanSchema>;

export const ingestTraceJobSchema = z.object({
  schemaVersion: jobSchemaVersion,
  projectId: z.uuid(),
  ingestId: z.string().min(1).max(128),
  receivedAt: z.iso.datetime(),
  spans: z.array(normalizedSpanSchema).min(1).max(10_000),
});
export type IngestTraceJob = z.input<typeof ingestTraceJobSchema>;

export const materializeTraceJobSchema = z.object({
  schemaVersion: jobSchemaVersion,
  projectId: z.uuid(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/i),
});
export type MaterializeTraceJob = z.input<typeof materializeTraceJobSchema>;

export type SpanDetail = Omit<NormalizedSpan, "projectId" | "expiresAt" | "ingestVersion">;

export type TraceSpanSummary = Pick<
  SpanDetail,
  | "traceId"
  | "spanId"
  | "parentSpanId"
  | "name"
  | "observationKind"
  | "status"
  | "startTimeUnixNano"
  | "endTimeUnixNano"
  | "durationNano"
  | "serviceName"
  | "model"
  | "totalTokens"
  | "totalCost"
> & {
  statusMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputPreview?: string | null;
  outputPreview?: string | null;
  hasInput?: boolean;
  hasOutput?: boolean;
};

export type RunListItem = {
  projectId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  traceName: string | null;
  observationKind: ObservationKind;
  status: SpanStatus;
  statusMessage: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  serviceName: string;
  model: string | null;
  environment: string;
  release: string | null;
  version: string | null;
  serviceVersion: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  inputPreview: string | null;
  outputPreview: string | null;
};

export type RunFilters = {
  from?: string;
  to?: string;
  observationKinds?: ObservationKind[];
  statuses?: SpanStatus[];
  services?: string[];
  names?: string[];
  models?: string[];
  environments?: string[];
  releases?: string[];
  versions?: string[];
  serviceVersions?: string[];
  tags?: string[];
  userId?: string;
  sessionId?: string;
  traceId?: string;
  search?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  minTotalTokens?: number;
  maxTotalTokens?: number;
  minTotalCost?: number;
  maxTotalCost?: number;
};

export const runSortFields = [
  "startedAt",
  "endedAt",
  "name",
  "observationKind",
  "status",
  "durationMs",
  "serviceName",
  "model",
  "environment",
  "release",
  "version",
  "serviceVersion",
  "userId",
  "sessionId",
  "traceId",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "outputCost",
  "totalCost",
] as const;
export type RunSortField = (typeof runSortFields)[number];

export type RunFacets = {
  observationKind: FacetValue[];
  status: FacetValue[];
  service: FacetValue[];
  name: FacetValue[];
  model: FacetValue[];
  environment: FacetValue[];
  release: FacetValue[];
  version: FacetValue[];
  serviceVersion: FacetValue[];
  tag: FacetValue[];
};
