import { z } from "zod";

import type { MetricsBucket, MetricsRangePreset } from "./metrics.js";

import type { JsonValue } from "./shared.js";

import type { TraceFacetValue } from "./telemetry.js";

export const evaluationOutcomes = ["pass", "fail", "invalid", "unknown"] as const;
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

export const evaluationPayloadStatuses = [
  "captured",
  "not_requested",
  "size_limit",
  "serialization_error",
] as const;
export type EvaluationPayloadStatus = (typeof evaluationPayloadStatuses)[number];

export type EvaluationPayload = {
  input: JsonValue;
  expected?: JsonValue;
  context?: JsonValue;
  retrievalContext?: JsonValue;
  output?: JsonValue;
};

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
  payload: EvaluationPayload | null;
  payloadStatus: EvaluationPayloadStatus;
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

export const evaluationRunSortFields = [
  "startedAt",
  "suiteName",
  "status",
  "release",
  "environment",
  "evaluatedCases",
  "results",
  "passRate",
  "durationMs",
  "p95LatencyMs",
  "averageTotalTokens",
  "traceCoverage",
] as const;
export type EvaluationRunSortField = (typeof evaluationRunSortFields)[number];

export type EvaluationRunFacets = {
  suite: TraceFacetValue[];
  status: TraceFacetValue[];
  environment: TraceFacetValue[];
  release: TraceFacetValue[];
};

export type EvaluationRunDetail = {
  run: EvaluationRunSummary;
  metrics: EvaluationMetricBreakdown[];
  results: EvaluationResult[];
  cases: EvaluationRunCaseDetail[];
};

export type EvaluationRunCaseDetail = {
  caseId: string | null;
  outcome: EvaluationOutcome;
  traceId: string | null;
  payload: EvaluationPayload | null;
  payloadStatus: EvaluationPayloadStatus;
  payloadConsistent: boolean;
  datasetItem?: ManagedDatasetCaseInput | null;
  results: EvaluationResult[];
};

export type EvaluationDatasetSummary = {
  name: string;
  versionCount: number;
  runCount: number;
  latestVersion: string | null;
  latestRunAt: string;
};

export type EvaluationDatasetVersionSummary = {
  version: string | null;
  status: "complete" | "incomplete" | "conflict";
  caseCount: number;
  runCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  canonicalRunId: string | null;
};

export type EvaluationDatasetCase = {
  caseId: string;
  payload: EvaluationPayload | null;
  payloadStatus: EvaluationPayloadStatus;
  conflict: boolean;
};

export type EvaluationDatasetDetail = {
  name: string;
  selectedVersion: EvaluationDatasetVersionSummary;
  versions: EvaluationDatasetVersionSummary[];
  cases: EvaluationDatasetCase[];
  runs: EvaluationRunSummary[];
};

const managedDatasetMetadataSchema = z.record(z.string(), z.json());

export const managedDatasetInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(2_000).optional(),
  metadata: managedDatasetMetadataSchema.optional(),
});
export type ManagedDatasetInput = z.infer<typeof managedDatasetInputSchema>;

export const managedDatasetUpdateSchema = managedDatasetInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one dataset field is required",
  });
export type ManagedDatasetUpdate = z.infer<typeof managedDatasetUpdateSchema>;

export const managedDatasetVersionInputSchema = z.object({
  version: z.string().trim().min(1).max(80),
});
export type ManagedDatasetVersionInput = z.infer<typeof managedDatasetVersionInputSchema>;

export const managedDatasetCaseInputSchema = z.object({
  id: z.string().trim().min(1).max(128),
  input: z.json(),
  expected: z.json().optional(),
  context: z.array(z.string()).max(1_000).optional(),
  retrievalContext: z.array(z.string()).max(1_000).optional(),
  metadata: managedDatasetMetadataSchema.optional(),
});
export type ManagedDatasetCaseInput = z.infer<typeof managedDatasetCaseInputSchema>;

export const managedDatasetCaseImportSchema = z
  .object({ items: z.array(managedDatasetCaseInputSchema).min(1).max(10_000) })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      const key = item.id.toLocaleLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Duplicate case ID: ${item.id}`,
        });
      }
      seen.add(key);
    }
  });
export type ManagedDatasetCaseImport = z.infer<typeof managedDatasetCaseImportSchema>;

export const managedDatasetObservedImportSchema = managedDatasetInputSchema.extend({
  sourceName: z.string().trim().min(1).max(128),
  sourceVersion: z.string().trim().max(80).nullable(),
  version: z.string().trim().min(1).max(80),
});
export type ManagedDatasetObservedImport = z.infer<typeof managedDatasetObservedImportSchema>;

export type ManagedDatasetVersionStatus = "draft" | "published";

export type ManagedDatasetVersion = {
  id: string;
  datasetId: string;
  version: string;
  status: ManagedDatasetVersionStatus;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ManagedDatasetSummary = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  metadata: Record<string, JsonValue>;
  draft: ManagedDatasetVersion | null;
  latestPublished: ManagedDatasetVersion | null;
  versionCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedDatasetDetail = ManagedDatasetSummary & {
  versions: ManagedDatasetVersion[];
};

export type ManagedDatasetVersionDetail = ManagedDatasetVersion & {
  dataset: Omit<ManagedDatasetSummary, "draft" | "latestPublished" | "versionCount">;
  items: ManagedDatasetCaseInput[];
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
