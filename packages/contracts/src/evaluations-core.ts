import { z } from "zod";
import { jobSchemaVersion } from "./job-schema.js";
import type { FacetValue } from "./shared.js";

export const evaluationOutcomes = ["pass", "fail", "invalid", "unknown"] as const;
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

export const evaluationSources = ["telemetry", "human", "end_user"] as const;
export type EvaluationSource = (typeof evaluationSources)[number];

export const evaluationPayloadStatuses = [
  "captured",
  "not_requested",
  "size_limit",
  "serialization_error",
] as const;
export type EvaluationPayloadStatus = (typeof evaluationPayloadStatuses)[number];

export const evaluationPayloadSchema = z.object({
  input: z.json(),
  expected: z.json().optional(),
  context: z.json().optional(),
  retrievalContext: z.json().optional(),
  output: z.json().optional(),
});
export type EvaluationPayload = z.infer<typeof evaluationPayloadSchema>;

export const traceReviewInputSchema = z.object({
  outcome: z.enum(["pass", "fail"]),
  explanation: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .transform((value) => value || undefined),
});
export type TraceReviewInput = z.infer<typeof traceReviewInputSchema>;

const jsonRecordSchema = z.record(z.string(), z.json());

export const evaluationResultSchema = z.object({
  projectId: z.uuid(),
  id: z.string().min(1).max(128),
  runId: z.string().max(128).nullable(),
  timestamp: z.iso.datetime(),
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/i)
    .nullable(),
  observationId: z.string().max(128).nullable(),
  responseId: z.string().max(128).nullable(),
  suiteName: z.string().min(1).max(128),
  caseId: z.string().max(128).nullable(),
  metricName: z.string().min(1).max(128),
  outcome: z.enum(evaluationOutcomes),
  dataType: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"]).nullable(),
  numericValue: z.number().finite().nullable(),
  categoricalValue: z.string().nullable(),
  explanation: z.string().nullable(),
  payload: evaluationPayloadSchema.nullable(),
  payloadStatus: z.enum(evaluationPayloadStatuses),
  configId: z.string().nullable(),
  serviceName: z.string(),
  environment: z.string(),
  release: z.string().nullable(),
  metadata: jsonRecordSchema,
  source: z.enum(evaluationSources),
  reviewer: z.object({ id: z.string(), name: z.string() }).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  ingestedAt: z.iso.datetime(),
  ingestVersion: z.string(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export const evaluationRunStatuses = ["running", "completed", "failed"] as const;
export type EvaluationRunStatus = (typeof evaluationRunStatuses)[number];

export const evaluationRunSchema = z.object({
  projectId: z.uuid(),
  id: z.string().min(1).max(128),
  status: z.enum(evaluationRunStatuses),
  suiteName: z.string().min(1).max(128),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  caseCount: z.number().int().nonnegative(),
  metricNames: z.array(z.string()),
  passed: z.number().int().nonnegative().nullable(),
  failed: z.number().int().nonnegative().nullable(),
  invalid: z.number().int().nonnegative().nullable(),
  serviceName: z.string(),
  environment: z.string(),
  release: z.string().nullable(),
  datasetName: z.string().nullable(),
  datasetVersion: z.string().nullable(),
  promptName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  metadata: jsonRecordSchema,
  expiresAt: z.iso.datetime().nullable(),
  ingestedAt: z.iso.datetime(),
  ingestVersion: z.string(),
  stateVersion: z.union([z.literal(1), z.literal(2)]),
});
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

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

export const ingestEvaluationsJobSchema = z.object({
  schemaVersion: jobSchemaVersion,
  projectId: z.uuid(),
  ingestId: z.string().min(1).max(128),
  receivedAt: z.iso.datetime(),
  evaluations: z.array(evaluationResultSchema).max(10_000),
  runs: z.array(evaluationRunSchema).max(10_000).default([]),
});
export type IngestEvaluationsJob = z.input<typeof ingestEvaluationsJobSchema>;

export type EvaluationFilters = {
  from?: string;
  to?: string;
  suites?: string[];
  metrics?: string[];
  outcomes?: EvaluationOutcome[];
  environments?: string[];
  releases?: string[];
  sources?: EvaluationSource[];
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
  suite: FacetValue[];
  status: FacetValue[];
  environment: FacetValue[];
  release: FacetValue[];
};
