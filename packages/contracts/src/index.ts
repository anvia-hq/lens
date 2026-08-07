import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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

export const evaluationOutcomes = ["pass", "fail", "invalid", "unknown"] as const;
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

export type EvaluationResult = {
  projectId: string;
  id: string;
  runId: string | null;
  timestamp: string;
  traceId: string | null;
  observationId: string | null;
  responseId: string | null;
  suiteName: string;
  caseId: string | null;
  metricName: string;
  outcome: EvaluationOutcome;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN" | null;
  numericValue: number | null;
  categoricalValue: string | null;
  explanation: string | null;
  configId: string | null;
  serviceName: string;
  environment: string;
  release: string | null;
  metadata: Record<string, JsonValue>;
  expiresAt: string | null;
  ingestedAt: string;
  ingestVersion: string;
};

export const evaluationRunStatuses = ["running", "completed", "failed"] as const;
export type EvaluationRunStatus = (typeof evaluationRunStatuses)[number];

export type EvaluationRun = {
  projectId: string;
  id: string;
  status: EvaluationRunStatus;
  suiteName: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  caseCount: number;
  metricNames: string[];
  passed: number | null;
  failed: number | null;
  invalid: number | null;
  serviceName: string;
  environment: string;
  release: string | null;
  datasetName: string | null;
  datasetVersion: string | null;
  metadata: Record<string, JsonValue>;
  expiresAt: string | null;
  ingestedAt: string;
  ingestVersion: string;
  stateVersion: 1 | 2;
};

export type EvaluationRunSummary = EvaluationRun & {
  results: number;
  actualPassed: number;
  actualFailed: number;
  actualInvalid: number;
  actualUnknown: number;
  passRate: number;
  evaluatedCases: number;
  evaluatedTraces: number;
  p95LatencyMs: number | null;
  averageTotalTokens: number | null;
  traceCoverage: number;
};

export type IngestEvaluationsJob = {
  projectId: string;
  ingestId: string;
  receivedAt: string;
  evaluations: EvaluationResult[];
  runs: EvaluationRun[];
};

export type ReconcileRetentionJob = {
  projectId: string;
  retentionDays: number | null;
};

export type DeleteProjectTelemetryJob = {
  projectId: string;
};

export type RecalculateModelCostsJob = {
  recalculationId: string;
};

export type LlmModelPriceSnapshot = {
  model: string;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number;
};

export type LlmModel = {
  id: string | null;
  model: string;
  observed: boolean;
  inputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  updatedAt: string | null;
};

export type CostRecalculationStatus = "queued" | "running" | "completed" | "failed";

export type CostRecalculation = {
  id: string;
  status: CostRecalculationStatus;
  from: string | null;
  to: string | null;
  requestedBy: { id: string; name: string; email: string };
  affectedSpans: number | null;
  affectedTraces: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type LlmModelsResponse = {
  items: LlmModel[];
};

export type CostRecalculationsResponse = {
  recalculations: CostRecalculation[];
  hasActiveRecalculation: boolean;
};

export type ProjectSettings = {
  retentionDays: 7 | 30 | 90 | null;
  redactionPatterns: string[];
};

export type Project = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  state: "active" | "deleting";
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
};

export type ProjectApiKey = {
  id: string;
  projectId: string;
  name: string;
  publicKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedProjectApiKey = ProjectApiKey & {
  secretKey: string;
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

export type EvaluationFilters = {
  from?: string;
  to?: string;
  suites?: string[];
  metrics?: string[];
  outcomes?: EvaluationOutcome[];
  environments?: string[];
  releases?: string[];
  traceId?: string;
  runIds?: string[];
  search?: string;
};

export type EvaluationRunFilters = {
  from?: string;
  to?: string;
  suites?: string[];
  statuses?: EvaluationRunStatus[];
  environments?: string[];
  releases?: string[];
  search?: string;
};

export type EvaluationRunDetail = {
  run: EvaluationRunSummary;
  metrics: EvaluationMetricBreakdown[];
  results: EvaluationResult[];
};

export type ComparisonValue = {
  candidate: number | null;
  baseline: number | null;
  delta: number | null;
  percentChange: number | null;
};

export type EvaluationMetricComparison = {
  metricName: string;
  candidate: EvaluationMetricBreakdown | null;
  baseline: EvaluationMetricBreakdown | null;
  passRateDelta: number | null;
  averageScoreDelta: number | null;
};

export type EvaluationCaseChange = {
  caseId: string;
  metricName: string;
  classification: "regressed" | "improved" | "new_failure" | "removed";
  candidateOutcome: EvaluationOutcome | null;
  baselineOutcome: EvaluationOutcome | null;
  candidateValue: number | string | null;
  baselineValue: number | string | null;
  candidateTraceId: string | null;
  baselineTraceId: string | null;
};

export const qualityGateRuleSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("evaluation_threshold"),
      metricName: z.string().trim().min(1).max(128),
      measure: z.enum(["pass_rate", "average_score"]),
      operator: z.enum(["gte", "lte"]),
      value: z.number().finite(),
    }),
    z.object({
      type: z.literal("evaluation_regression"),
      metricName: z.string().trim().min(1).max(128),
      measure: z.enum(["pass_rate", "average_score"]),
      direction: z.enum(["decrease", "increase"]),
      maxAbsoluteChange: z.number().finite().nonnegative(),
    }),
    z.object({
      type: z.literal("operational_regression"),
      measure: z.enum(["p95_latency_ms", "average_total_tokens"]),
      maxIncreasePercent: z.number().finite().nonnegative(),
    }),
  ])
  .superRefine((rule, context) => {
    const value =
      rule.type === "evaluation_threshold"
        ? rule.value
        : rule.type === "evaluation_regression"
          ? rule.maxAbsoluteChange
          : undefined;
    if (rule.type !== "operational_regression" && rule.measure === "pass_rate") {
      if (value === undefined || value < 0 || value > 1) {
        context.addIssue({ code: "custom", message: "Pass-rate values must be between 0 and 1" });
      }
    }
  });
export type QualityGateRule = z.infer<typeof qualityGateRuleSchema>;

export const qualityGateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  suiteName: z.string().trim().min(1).max(128),
  environment: z.string().trim().min(1).max(128),
  minimumCaseCount: z.number().int().min(1).max(1_000_000),
  rules: z.array(qualityGateRuleSchema).min(1).max(25),
});
export type QualityGateInput = z.infer<typeof qualityGateInputSchema>;

export type QualityGate = QualityGateInput & {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type QualityGateRuleResult = {
  rule: QualityGateRule | { type: "minimum_case_count"; value: number };
  verdict: "pass" | "fail" | "insufficient_data";
  message: string;
  candidateValue: number | null;
  baselineValue: number | null;
};

export type QualityGateEvaluation = {
  gate: QualityGate;
  verdict: "pass" | "fail" | "insufficient_data";
  rules: QualityGateRuleResult[];
};

export type EvaluationRunComparison = {
  candidate: EvaluationRunSummary;
  baseline: EvaluationRunSummary;
  passRate: ComparisonValue;
  p95LatencyMs: ComparisonValue;
  averageTotalTokens: ComparisonValue;
  metrics: EvaluationMetricComparison[];
  caseChanges: EvaluationCaseChange[];
  caseChangeCounts: Record<EvaluationCaseChange["classification"], number>;
  warnings: string[];
  gate: QualityGateEvaluation | null;
};

export const evaluationSortFields = [
  "timestamp",
  "suiteName",
  "caseId",
  "metricName",
  "outcome",
  "numericValue",
  "environment",
  "release",
] as const;
export type EvaluationSortField = (typeof evaluationSortFields)[number];

export type EvaluationFacets = {
  suite: TraceFacetValue[];
  metric: TraceFacetValue[];
  outcome: TraceFacetValue[];
  environment: TraceFacetValue[];
  release: TraceFacetValue[];
};

export type EvaluationMetricBreakdown = {
  metricName: string;
  results: number;
  passed: number;
  failed: number;
  invalid: number;
  unknown: number;
  passRate: number;
  averageNumericValue: number | null;
};

export type EvaluationSuiteBreakdown = {
  suiteName: string;
  results: number;
  passed: number;
  failed: number;
  invalid: number;
  unknown: number;
  passRate: number;
};

export type EvaluationMetricPoint = {
  timestamp: string;
  results: number;
  passed: number;
  failed: number;
  invalid: number;
  unknown: number;
  passRate: number;
};

export type EvaluationOverview = {
  range: {
    preset: MetricsRangePreset;
    bucket: MetricsBucket;
    from: string;
    to: string;
  };
  summary: {
    results: number;
    passed: number;
    failed: number;
    invalid: number;
    unknown: number;
    passRate: number;
    evaluatedTraces: number;
  };
  series: EvaluationMetricPoint[];
  metrics: EvaluationMetricBreakdown[];
  suites: EvaluationSuiteBreakdown[];
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
export type SortOrder = "asc" | "desc";

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

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

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export const metricsRangePresets = ["24h", "7d", "30d"] as const;
export type MetricsRangePreset = (typeof metricsRangePresets)[number];
export type MetricsBucket = "hour" | "6hours" | "day";

export type MetricPoint = {
  timestamp: string;
  traces: number;
  traceErrors: number;
  generations: number;
  inputTokens: number;
  outputTokens: number;
  generationDurationP50Ms: number | null;
  generationDurationP95Ms: number | null;
};

export type MetricsSummary = {
  traces: number;
  spans: number;
  generations: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokensPerGeneration: number;
  generationDurationP50Ms: number;
  generationDurationP95Ms: number;
  activeModels: number;
  activeUsers: number;
  activeSessions: number;
};

export type ModelMetrics = {
  model: string | null;
  generations: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenShare: number;
  tokensPerGeneration: number;
  durationP95Ms: number;
};

export type ServiceMetrics = {
  serviceName: string;
  traces: number;
  generations: number;
  errors: number;
  errorRate: number;
  totalTokens: number;
  durationP95Ms: number;
};

export type Metrics = {
  range: {
    preset: MetricsRangePreset;
    bucket: MetricsBucket;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  current: MetricsSummary;
  previous: MetricsSummary;
  series: MetricPoint[];
  models: ModelMetrics[];
  services: ServiceMetrics[];
  topTokenTraces: TraceSummary[];
  recentErrors: TraceSummary[];
};

export const metricsRangeSchema = z.enum(metricsRangePresets);

export const projectSettingsSchema = z.object({
  retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]),
  redactionPatterns: z.array(z.string().trim().min(1).max(256)).max(100),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export function encodeCursor(startedAt: string, traceId: string): string {
  return Buffer.from(JSON.stringify([startedAt, traceId]), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { startedAt: string; traceId: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return undefined;
    }
    return { startedAt: parsed[0], traceId: parsed[1] };
  } catch {
    return undefined;
  }
}
