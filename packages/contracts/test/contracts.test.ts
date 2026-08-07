import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  metricsRangeSchema,
  projectSettingsSchema,
  qualityGateInputSchema,
} from "../src/index";

describe("contracts", () => {
  it("round-trips an opaque trace cursor", () => {
    const cursor = encodeCursor("2026-08-05T00:00:00.000Z", "a".repeat(32));
    expect(decodeCursor(cursor)).toEqual({
      startedAt: "2026-08-05T00:00:00.000Z",
      traceId: "a".repeat(32),
    });
  });

  it("validates supported retention options", () => {
    expect(
      projectSettingsSchema.safeParse({ retentionDays: 30, redactionPatterns: [] }).success,
    ).toBe(true);
    expect(
      projectSettingsSchema.safeParse({ retentionDays: 14, redactionPatterns: [] }).success,
    ).toBe(false);
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
});
