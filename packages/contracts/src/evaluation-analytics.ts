import type { ManagedDatasetCaseInput } from "./evaluation-datasets.js";
import type {
  EvaluationOutcome,
  EvaluationPayload,
  EvaluationPayloadStatus,
  EvaluationResult,
  EvaluationRunSummary,
} from "./evaluations-core.js";
import type { MetricsBucket, MetricsRangePreset } from "./metrics.js";
import type { QualityGateEvaluation } from "./quality-gates.js";
import type { FacetValue } from "./shared.js";

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
  suite: FacetValue[];
  metric: FacetValue[];
  outcome: FacetValue[];
  environment: FacetValue[];
  release: FacetValue[];
  source: FacetValue[];
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
