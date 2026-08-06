import type {
  MetricsRangePreset,
  SessionSortField,
  SessionStatus,
  SpanDetail,
  SpanStatus,
  TraceSortField,
} from "@lens/contracts";

export type TraceSpanView = "tree" | "timeline";
export type TracePayloadView = "formatted" | "json";

export type SpanTreeNode = {
  span: SpanDetail;
  children: SpanTreeNode[];
};

export type FlatSpanNode = {
  span: SpanDetail;
  depth: number;
  ancestorContinues: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
};

export type OverviewSearch = { range: MetricsRangePreset };

export type TraceDetailSearch = {
  view?: TraceSpanView;
  span?: string;
};

export const traceColumnIds = [
  "startedAt",
  "trace",
  "status",
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
