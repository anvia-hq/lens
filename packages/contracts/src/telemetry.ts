import type { EvaluationResult } from "./evaluations.js";

import type { JsonValue } from "./shared.js";

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

export type NormalizedSpan = {
  projectId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceState: string;
  name: string;
  kind: number;
  observationKind: ObservationKind;
  status: SpanStatus;
  statusMessage: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  durationNano: string;
  serviceName: string;
  scopeName: string;
  scopeVersion: string;
  resourceAttributes: Record<string, JsonValue>;
  spanAttributes: Record<string, JsonValue>;
  events: JsonValue[];
  links: JsonValue[];
  traceName: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  version: string | null;
  environment: string;
  release: string | null;
  serviceVersion: string | null;
  model: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  input: JsonValue | null;
  output: JsonValue | null;
  expiresAt: string | null;
  ingestedAt: string;
  ingestVersion: string;
};

export type IngestTraceJob = {
  projectId: string;
  ingestId: string;
  receivedAt: string;
  spans: NormalizedSpan[];
};

export type MaterializeTraceJob = {
  projectId: string;
  traceId: string;
};

export type SpanDetail = Omit<NormalizedSpan, "projectId" | "expiresAt" | "ingestVersion">;

export type TraceSummary = {
  projectId: string;
  traceId: string;
  name: string;
  serviceName: string;
  status: SpanStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  spanCount: number;
  generationCount: number;
  toolCount: number;
  errorCount: number;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  model: string | null;
  environment: string;
  release: string | null;
  version: string | null;
  serviceVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  lastSeenAt: string;
};

export type TraceDetail = {
  summary: TraceSummary;
  spans: SpanDetail[];
  evaluations: EvaluationResult[];
};

export type SessionSummary = {
  projectId: string;
  sessionId: string;
  userId: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  traceCount: number;
  errorCount: number;
  spanErrorCount: number;
  spanCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  status: "success" | "error";
  services: string[];
  environments: string[];
  models: string[];
  tags: string[];
  lastSeenAt: string;
};

export type SessionTurnPayload = {
  spanId: string;
  spanName: string;
  observationKind: ObservationKind;
  value: JsonValue;
};

export type SessionTurn = {
  trace: TraceSummary;
  prompt: SessionTurnPayload | null;
  response: SessionTurnPayload | null;
};

export type SessionDetail = {
  summary: SessionSummary;
  traces: TraceSummary[];
  turns: SessionTurn[];
};

export type UserSummary = {
  projectId: string;
  userId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  traceCount: number;
  sessionCount: number;
  errorCount: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
};

export type UserFilters = {
  from?: string;
  to?: string;
  search?: string;
  exactUserId?: string;
};

export const userSortFields = [
  "userId",
  "firstSeenAt",
  "lastSeenAt",
  "traceCount",
  "sessionCount",
  "errorCount",
  "errorRate",
  "totalTokens",
  "totalCost",
] as const;
export type UserSortField = (typeof userSortFields)[number];

export type SessionStatus = "success" | "error";

export type SessionFilters = {
  from?: string;
  to?: string;
  statuses?: SessionStatus[];
  users?: string[];
  services?: string[];
  models?: string[];
  environments?: string[];
  tags?: string[];
  search?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  minTotalTokens?: number;
  maxTotalTokens?: number;
  minTotalCost?: number;
  maxTotalCost?: number;
};

export const sessionSortFields = [
  "startedAt",
  "endedAt",
  "sessionId",
  "userId",
  "status",
  "durationMs",
  "traceCount",
  "errorCount",
  "spanCount",
  "totalTokens",
  "totalCost",
  "lastSeenAt",
] as const;
export type SessionSortField = (typeof sessionSortFields)[number];

export type SessionFacets = {
  status: TraceFacetValue[];
  user: TraceFacetValue[];
  service: TraceFacetValue[];
  model: TraceFacetValue[];
  environment: TraceFacetValue[];
  tag: TraceFacetValue[];
};

export type TraceFilters = {
  from?: string;
  to?: string;
  statuses?: SpanStatus[];
  services?: string[];
  names?: string[];
  models?: string[];
  environments?: string[];
  releases?: string[];
  versions?: string[];
  serviceVersions?: string[];
  userId?: string;
  exactUserId?: string;
  sessionId?: string;
  traceId?: string;
  tags?: string[];
  search?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  minTotalTokens?: number;
  maxTotalTokens?: number;
  minTotalCost?: number;
  maxTotalCost?: number;
};

export const traceSortFields = [
  "startedAt",
  "endedAt",
  "name",
  "traceId",
  "serviceName",
  "status",
  "durationMs",
  "spanCount",
  "generationCount",
  "toolCount",
  "userId",
  "sessionId",
  "model",
  "environment",
  "release",
  "version",
  "serviceVersion",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "inputCost",
  "outputCost",
  "totalCost",
] as const;
export type TraceSortField = (typeof traceSortFields)[number];

export type TraceFacetValue = { value: string; count: number };
export type TraceFacets = {
  status: TraceFacetValue[];
  service: TraceFacetValue[];
  name: TraceFacetValue[];
  model: TraceFacetValue[];
  environment: TraceFacetValue[];
  release: TraceFacetValue[];
  version: TraceFacetValue[];
  serviceVersion: TraceFacetValue[];
  tag: TraceFacetValue[];
};
