import type {
  AlertRuleKind,
  EvaluationOutcome,
  EvaluationRunSortField,
  EvaluationSortField,
  EvaluationSource,
  MetricsRangePreset,
  SessionSortField,
  SessionStatus,
  SpanDetail,
  TraceSortField,
  TraceStatus,
  UserSortField,
} from "@lens/contracts";

export type AlertsSearch = {
  tab: "incidents" | "rules";
  status: "active" | "resolved";
  kind?: AlertRuleKind;
  page: number;
};

export type TraceSpanView = "tree" | "timeline" | "graph";
export type TracePayloadView = "formatted" | "json";

export type SpanTreeNode = {
  span: SpanDetail;
  children: SpanTreeNode[];
  provisional?: boolean;
};

export type FlatSpanNode = {
  span: SpanDetail;
  depth: number;
  ancestorContinues: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
  provisional: boolean;
};

export type OverviewSearch = { range: MetricsRangePreset };

export const evaluationRunColumnIds = [
  "startedAt",
  "runId",
  "suite",
  "status",
  "release",
  "evaluatedCases",
  "passRate",
  "durationMs",
  "environment",
  "dataset",
  "results",
  "p95LatencyMs",
  "averageTotalTokens",
  "traceCoverage",
] as const;
export type EvaluationRunColumnId = (typeof evaluationRunColumnIds)[number];
export const defaultEvaluationRunColumns: EvaluationRunColumnId[] = [
  "startedAt",
  "runId",
  "suite",
  "status",
  "release",
  "evaluatedCases",
  "passRate",
  "durationMs",
];

export const evaluationResultColumnIds = [
  "timestamp",
  "resultId",
  "suite",
  "case",
  "metricName",
  "outcome",
  "value",
  "environment",
  "release",
  "traceId",
  "runId",
  "serviceName",
  "explanation",
  "observationId",
  "source",
] as const;
export type EvaluationResultColumnId = (typeof evaluationResultColumnIds)[number];
export const defaultEvaluationResultColumns: EvaluationResultColumnId[] = [
  "timestamp",
  "resultId",
  "suite",
  "case",
  "metricName",
  "outcome",
  "value",
  "environment",
  "release",
  "traceId",
];

export type LegacyEvaluationsSearch = {
  view?: "runs" | "compare" | "results" | "gates";
  runId?: string;
  candidateRunId?: string;
  baselineRunId?: string;
  gateId?: string;
  status?: "running" | "completed" | "failed";
  range: MetricsRangePreset;
  suite?: string;
  metric?: string;
  outcome?: EvaluationOutcome;
  environment?: string;
  release?: string;
  search?: string;
  sort?: EvaluationSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
};

export type EvaluationRunsSearch = {
  range: MetricsRangePreset;
  statuses?: ("running" | "completed" | "failed")[];
  suites?: string[];
  environments?: string[];
  releases?: string[];
  search?: string;
  sort?: EvaluationRunSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
  columns?: EvaluationRunColumnId[];
};

export type ResolvedEvaluationRunsSearch = EvaluationRunsSearch & {
  sort: EvaluationRunSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: EvaluationRunColumnId[];
};

export type EvaluationResultsSearch = {
  range: MetricsRangePreset;
  suites?: string[];
  metrics?: string[];
  outcomes?: EvaluationOutcome[];
  sources?: EvaluationSource[];
  environments?: string[];
  releases?: string[];
  search?: string;
  sort?: EvaluationSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
  columns?: EvaluationResultColumnId[];
};

export type ResolvedEvaluationResultsSearch = EvaluationResultsSearch & {
  sort: EvaluationSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: EvaluationResultColumnId[];
};

export type EvaluationCompareSearch = {
  candidateRunId?: string;
  baselineRunId?: string;
  gateId?: string;
};

export type EvaluationRunDetailSearch = {
  case?: string;
};

export type EvaluationDatasetsSearch = {
  tab?: "managed" | "observed";
  search?: string;
  page?: number;
};

export type ObservedDatasetDetailSearch = {
  version?: string;
};

export type ManagedDatasetDetailSearch = {
  version?: string;
};

export type TraceDetailSearch = {
  view?: TraceSpanView;
  span?: string;
};

export type TraceCompareSearch = {
  traceIds: string[];
};

export const traceColumnIds = [
  "startedAt",
  "trace",
  "status",
  "review",
  "durationMs",
  "totalCost",
  "model",
  "totalTokens",
  "environment",
  "userId",
  "sessionId",
  "serviceName",
  "release",
  "version",
  "serviceVersion",
  "inputCost",
  "outputCost",
  "inputTokens",
  "outputTokens",
  "spanCount",
  "generationCount",
  "toolCount",
  "tags",
  "endedAt",
  "traceId",
] as const;

export type TraceColumnId = (typeof traceColumnIds)[number];

export const defaultTraceColumns: TraceColumnId[] = [
  "startedAt",
  "trace",
  "status",
  "review",
  "durationMs",
  "totalCost",
  "model",
  "totalTokens",
  "environment",
  "userId",
  "sessionId",
];

export type TracesSearch = {
  range: MetricsRangePreset;
  review?: "unreviewed" | "pass" | "fail";
  statuses?: TraceStatus[];
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
  sort?: TraceSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
  columns?: TraceColumnId[];
};

export const sessionColumnIds = [
  "startedAt",
  "session",
  "status",
  "userId",
  "traceCount",
  "spanCount",
  "durationMs",
  "totalTokens",
  "totalCost",
  "environments",
  "services",
  "lastSeenAt",
] as const;

export type SessionColumnId = (typeof sessionColumnIds)[number];

export const defaultSessionColumns: SessionColumnId[] = [
  "startedAt",
  "session",
  "status",
  "userId",
  "traceCount",
  "durationMs",
  "totalTokens",
  "totalCost",
];

export type SessionsSearch = {
  range: MetricsRangePreset;
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
  sort?: SessionSortField;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: 25 | 50 | 100;
  columns?: SessionColumnId[];
};

export type ResolvedSessionsSearch = SessionsSearch & {
  sort: SessionSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: SessionColumnId[];
};

export type ResolvedTracesSearch = TracesSearch & {
  sort: TraceSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: TraceColumnId[];
};

export type RefreshInterval = "5s" | "10s" | "30s" | "Off";

export type UserRange = "all" | MetricsRangePreset;

export const userColumnIds = [
  "userId",
  "firstSeenAt",
  "lastSeenAt",
  "traceCount",
  "sessionCount",
  "errorRate",
  "totalTokens",
  "totalCost",
] as const;
export type UserColumnId = (typeof userColumnIds)[number];
export const defaultUserColumns: UserColumnId[] = [...userColumnIds];

export type UsersSearch = {
  range: UserRange;
  search?: string;
  sort: UserSortField;
  order: "asc" | "desc";
  page: number;
  pageSize: 25 | 50 | 100;
  columns: UserColumnId[];
};

export type UserDetailSearch = {
  range: UserRange;
  tab: "traces" | "sessions";
  page: number;
  pageSize: 25 | 50 | 100;
  sort?: TraceSortField | SessionSortField;
  order: "asc" | "desc";
};
