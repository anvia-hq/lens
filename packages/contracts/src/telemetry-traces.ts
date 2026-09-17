import type { EvaluationResult } from "./evaluations.js";
import type { FacetValue } from "./shared.js";
import { spanStatuses, type TraceSpanSummary } from "./telemetry-spans.js";

export const traceStatuses = ["running", ...spanStatuses] as const;
export type TraceStatus = (typeof traceStatuses)[number];

export type TraceSummary = {
  projectId: string;
  traceId: string;
  name: string;
  serviceName: string;
  status: TraceStatus;
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
  reviewOutcome?: "pass" | "fail" | null;
};

export type TraceListItem = TraceSummary & { reviewOutcome: "pass" | "fail" | null };

export type TraceDetail = {
  summary: TraceSummary;
  spans: TraceSpanSummary[];
  evaluations: EvaluationResult[];
};

export type TraceFilters = {
  from?: string;
  to?: string;
  statuses?: TraceStatus[];
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
  review?: "unreviewed" | "pass" | "fail";
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

export type TraceFacetValue = FacetValue;
export type TraceFacets = {
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
