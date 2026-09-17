import { z } from "zod";

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

export const qualityGateCheckInputSchema = z
  .object({
    candidateRunId: z.string().trim().min(1).max(128),
    baselineRunId: z.string().trim().min(1).max(128),
  })
  .refine((value) => value.candidateRunId !== value.baselineRunId, {
    message: "Candidate and baseline run IDs must differ",
  });
export type QualityGateCheckInput = z.infer<typeof qualityGateCheckInputSchema>;

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

export type QualityGateCheckResponse = QualityGateEvaluation & {
  candidateRunId: string;
  baselineRunId: string;
};
