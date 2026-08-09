import { z } from "zod";
import type { TraceListItem } from "./telemetry.js";

export const alertRuleKinds = [
  "trace_error_rate",
  "trace_p95_latency_ms",
  "tool_error_rate",
  "failed_human_review",
  "failed_quality_gate",
] as const;
export type AlertRuleKind = (typeof alertRuleKinds)[number];

export const alertIncidentStatuses = ["open", "acknowledged", "resolved"] as const;
export type AlertIncidentStatus = (typeof alertIncidentStatuses)[number];

const optionalScope = z
  .string()
  .trim()
  .max(128)
  .optional()
  .transform((value) => value || undefined);
const ruleBase = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
});
const scoped = {
  environment: optionalScope,
  serviceName: optionalScope,
};
const threshold = {
  threshold: z.number().finite().positive(),
  windowMinutes: z.union([z.literal(5), z.literal(15), z.literal(60)]),
  minimumSamples: z.number().int().min(1).max(1_000_000),
};

export const alertRuleInputSchema = z.discriminatedUnion("kind", [
  ruleBase
    .extend({ kind: z.literal("trace_error_rate"), ...threshold, ...scoped })
    .refine((value) => value.threshold <= 1, {
      path: ["threshold"],
      message: "Error-rate threshold must be at most 1",
    }),
  ruleBase.extend({ kind: z.literal("trace_p95_latency_ms"), ...threshold, ...scoped }),
  ruleBase
    .extend({
      kind: z.literal("tool_error_rate"),
      ...threshold,
      ...scoped,
      toolName: optionalScope,
    })
    .refine((value) => value.threshold <= 1, {
      path: ["threshold"],
      message: "Error-rate threshold must be at most 1",
    }),
  ruleBase.extend({ kind: z.literal("failed_human_review"), ...scoped }),
  ruleBase.extend({ kind: z.literal("failed_quality_gate"), qualityGateId: z.uuid() }),
]);
export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

export type AlertRule = AlertRuleInput & {
  id: string;
  projectId: string;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertIncidentEvidence = {
  traceIds?: string[];
  qualityGateId?: string;
  candidateRunId?: string;
  baselineRunId?: string;
};

export type AlertIncident = {
  id: string;
  projectId: string;
  ruleId: string | null;
  ruleName: string;
  kind: AlertRuleKind;
  status: AlertIncidentStatus;
  summary: string;
  observedValue: number | null;
  threshold: number | null;
  sampleCount: number | null;
  evidence: AlertIncidentEvidence;
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolution: string | null;
};

export type AlertSignalPoint = {
  timestamp: string;
  value: number | null;
  sampleCount: number;
};

export type AlertSignalSeries = {
  from: string;
  to: string;
  bucketMinutes: 1 | 5;
  points: AlertSignalPoint[];
};

export type AlertEvidenceTrace = {
  traceId: string;
  trace: TraceListItem | null;
};

export type AlertContributorDimension = "release" | "service" | "serviceVersion" | "model" | "tool";

export type AlertContributorMetric = "errorRate" | "p95DurationMs";

export type AlertContributorSample = {
  sampleCount: number;
  value: number;
};

export type AlertContributorHint = {
  dimension: AlertContributorDimension;
  value: string;
  metric: AlertContributorMetric;
  baseline: AlertContributorSample;
  breach: AlertContributorSample;
  delta: number;
  percentChange: number | null;
  isNew: boolean;
  baselineTraceId: string | null;
  breachTraceId: string | null;
};

export type AlertContributorAnalysis = {
  baselineFrom: string;
  baselineTo: string;
  breachFrom: string;
  breachTo: string;
  hints: AlertContributorHint[];
  unavailableReason: "telemetry_expired" | "insufficient_data" | "analysis_failed" | null;
};

export type AlertIncidentDetail = {
  incident: AlertIncident;
  rule: AlertRuleInput | null;
  signal: AlertSignalSeries | null;
  contributorAnalysis: AlertContributorAnalysis | null;
  evidenceTraces: AlertEvidenceTrace[];
};

export const evaluateAlertsJobSchema = z.object({ projectId: z.uuid().optional() });
export type EvaluateAlertsJob = z.infer<typeof evaluateAlertsJobSchema>;
