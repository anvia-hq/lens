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

  it("requires complete, bounded evidence settings while preserving legacy rules", () => {
    const rule = {
      type: "evaluation_threshold",
      metricName: "safety",
      measure: "pass_rate",
      operator: "lte",
      value: 0.05,
    };
    expect(qualityGateRuleSchema.parse(rule)).not.toHaveProperty("evidence");
    const evidence = { minimumValidCases: 10, maxInvalidRate: 0, maxUnknownRate: 0.1 };
    expect(qualityGateRuleSchema.parse({ ...rule, evidence })).toMatchObject({ evidence });
    for (const invalid of [
      {},
      { ...evidence, minimumValidCases: 0 },
      { ...evidence, minimumValidCases: 1.5 },
      { ...evidence, maxInvalidRate: -0.1 },
      { ...evidence, maxUnknownRate: 1.1 },
    ]) {
      expect(qualityGateRuleSchema.safeParse({ ...rule, evidence: invalid }).success).toBe(false);
    }
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
