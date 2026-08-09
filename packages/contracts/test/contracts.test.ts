import { describe, expect, it } from "vitest";
import {
  alertRuleInputSchema,
  createApiKeySchema,
  createProjectSchema,
  decodeCursor,
  encodeCursor,
  managedDatasetCaseImportSchema,
  managedDatasetCaseInputSchema,
  managedDatasetUpdateSchema,
  metricsRangeSchema,
  projectSettingsSchema,
  qualityGateCheckInputSchema,
  qualityGateInputSchema,
  qualityGateRuleSchema,
  traceReviewInputSchema,
} from "../src/index";

describe("contracts", () => {
  it("round-trips an opaque trace cursor", () => {
    const cursor = encodeCursor("2026-08-05T00:00:00.000Z", "a".repeat(32));
    expect(decodeCursor(cursor)).toEqual({
      startedAt: "2026-08-05T00:00:00.000Z",
      traceId: "a".repeat(32),
    });
  });

  it.each([
    "not-json",
    Buffer.from(JSON.stringify([])).toString("base64url"),
    Buffer.from(JSON.stringify(["timestamp"])).toString("base64url"),
    Buffer.from(JSON.stringify(["timestamp", 42])).toString("base64url"),
  ])("rejects malformed cursors", (cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined();
  });

  it("validates supported retention options", () => {
    expect(projectSettingsSchema.safeParse({ retentionDays: 30 }).success).toBe(true);
    expect(projectSettingsSchema.safeParse({ retentionDays: 14 }).success).toBe(false);
  });

  it("accepts only supported overview ranges", () => {
    expect(metricsRangeSchema.safeParse("24h").success).toBe(true);
    expect(metricsRangeSchema.safeParse("7d").success).toBe(true);
    expect(metricsRangeSchema.safeParse("30d").success).toBe(true);
    expect(metricsRangeSchema.safeParse("90d").success).toBe(false);
  });

  it("validates quality gate rules and pass-rate ranges", () => {
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
  });

  it("validates every quality-gate rule variant", () => {
    expect(
      qualityGateRuleSchema.safeParse({
        type: "evaluation_regression",
        metricName: "latency",
        measure: "average_score",
        direction: "increase",
        maxAbsoluteChange: 0,
      }).success,
    ).toBe(true);
    expect(
      qualityGateRuleSchema.safeParse({
        type: "operational_regression",
        measure: "p95_latency_ms",
        maxIncreasePercent: 10,
      }).success,
    ).toBe(true);
    expect(
      qualityGateRuleSchema.safeParse({
        type: "evaluation_regression",
        metricName: "quality",
        measure: "pass_rate",
        direction: "decrease",
        maxAbsoluteChange: -0.1,
      }).success,
    ).toBe(false);
  });

  it("validates quality-gate checks and human trace reviews", () => {
    expect(
      qualityGateCheckInputSchema.parse({
        candidateRunId: " candidate ",
        baselineRunId: " baseline ",
      }),
    ).toEqual({ candidateRunId: "candidate", baselineRunId: "baseline" });
    expect(
      qualityGateCheckInputSchema.safeParse({
        candidateRunId: "same",
        baselineRunId: "same",
      }).success,
    ).toBe(false);
    expect(traceReviewInputSchema.parse({ outcome: "fail", explanation: "  broken  " })).toEqual({
      outcome: "fail",
      explanation: "broken",
    });
    expect(traceReviewInputSchema.safeParse({ outcome: "unknown" }).success).toBe(false);
  });

  it("validates alert rule thresholds and quality-gate selection", () => {
    expect(
      alertRuleInputSchema.safeParse({
        name: "Production errors",
        kind: "trace_error_rate",
        threshold: 0.05,
        windowMinutes: 15,
        minimumSamples: 20,
      }).success,
    ).toBe(true);
    expect(
      alertRuleInputSchema.safeParse({
        name: "Impossible error rate",
        kind: "trace_error_rate",
        threshold: 1.1,
        windowMinutes: 15,
        minimumSamples: 20,
      }).success,
    ).toBe(false);
    expect(
      alertRuleInputSchema.safeParse({
        name: "Release gate",
        kind: "failed_quality_gate",
        qualityGateId: "10000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("normalizes project inputs and rejects invalid slugs and empty key names", () => {
    expect(createProjectSchema.parse({ name: "  Support  ", slug: "support-agents" })).toEqual({
      name: "Support",
      slug: "support-agents",
    });
    expect(createProjectSchema.safeParse({ name: "Support", slug: "Support Agents" }).success).toBe(
      false,
    );
    expect(createApiKeySchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("validates managed dataset cases and rejects duplicate import IDs", () => {
    expect(
      managedDatasetCaseInputSchema.safeParse({
        id: "refund",
        input: { question: "Can I get a refund?" },
        expected: "30 days",
        context: ["Refund policy"],
        metadata: { owner: "support" },
      }).success,
    ).toBe(true);
    expect(
      managedDatasetCaseImportSchema.safeParse({
        items: [
          { id: "Refund", input: "a" },
          { id: "refund", input: "b" },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires at least one field when updating a managed dataset", () => {
    expect(managedDatasetUpdateSchema.parse({ name: "  Support cases  " })).toEqual({
      name: "Support cases",
    });
    expect(managedDatasetUpdateSchema.safeParse({}).success).toBe(false);
  });
});
