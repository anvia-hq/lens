import type { FacetValue, JsonValue } from "./shared.js";
import type { ObservationKind } from "./telemetry-spans.js";
import type { TraceSummary } from "./telemetry-traces.js";

export const sessionStatuses = ["running", "success", "error"] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

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
  status: SessionStatus;
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
  nextCursor: string | null;
};

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
  status: FacetValue[];
  user: FacetValue[];
  service: FacetValue[];
  model: FacetValue[];
  environment: FacetValue[];
  tag: FacetValue[];
};
