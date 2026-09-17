import { describe, expect, it } from "vitest";
import {
  managedDatasetCaseImportSchema,
  managedDatasetCaseInputSchema,
  managedDatasetUpdateSchema,
  qualityGateCheckInputSchema,
  qualityGateInputSchema,
  qualityGateRuleSchema,
  traceReviewInputSchema,
} from "../src/index.js";

describe("evaluation contracts", () => {
  it("validates quality-gate rules and checks", () => {
    const gate = {
      name: "Production",
      suiteName: "support",
      environment: "production",
      minimumCaseCount: 10,
      rules: [
        {
          type: "evaluation_threshold",
          metricName: "correctness",
          measure: "pass_rate",
          operator: "gte",
          value: 0.9,
        },
      ],
    };
    expect(qualityGateInputSchema.safeParse(gate).success).toBe(true);
    expect(
      qualityGateInputSchema.safeParse({
        ...gate,
        rules: [{ ...gate.rules[0], value: 1.1 }],
      }).success,
    ).toBe(false);
    expect(
      qualityGateRuleSchema.safeParse({
        type: "operational_regression",
        measure: "p95_latency_ms",
        maxIncreasePercent: 10,
      }).success,
    ).toBe(true);
    expect(
      qualityGateCheckInputSchema.safeParse({ candidateRunId: "same", baselineRunId: "same" })
        .success,
    ).toBe(false);
  });

  it("normalizes reviews and validates managed dataset updates", () => {
    expect(traceReviewInputSchema.parse({ outcome: "fail", explanation: "  broken  " })).toEqual({
      outcome: "fail",
      explanation: "broken",
    });
    expect(traceReviewInputSchema.parse({ outcome: "pass" })).toEqual({ outcome: "pass" });
    expect(managedDatasetUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      managedDatasetCaseInputSchema.safeParse({
        id: "refund",
        input: { question: "Can I get a refund?" },
        context: ["Refund policy"],
      }).success,
    ).toBe(true);
  });

  it("rejects case-insensitive duplicate dataset IDs", () => {
    expect(
      managedDatasetCaseImportSchema.safeParse({
        items: [
          { id: "Refund", input: "a" },
          { id: "refund", input: "b" },
        ],
      }).success,
    ).toBe(false);
  });
});
