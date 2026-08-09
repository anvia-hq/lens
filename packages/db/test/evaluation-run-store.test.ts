import type { EvaluationResult } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { compareCases, compareMetrics, comparisonValue } from "../src/evaluation-comparison.js";
import { groupRunCases } from "../src/evaluation-run-store.js";

describe("evaluation run cases", () => {
  it("groups metric results by case and uses failure-first outcome precedence", () => {
    const cases = groupRunCases([
      evaluation({ id: "quality", metricName: "quality", outcome: "pass" }),
      evaluation({ id: "safety", metricName: "safety", outcome: "fail" }),
    ]);

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseId: "case-1",
      outcome: "fail",
      traceId: "1234567890abcdef1234567890abcdef",
      payloadStatus: "captured",
      payloadConsistent: true,
      results: [{ metricName: "quality" }, { metricName: "safety" }],
    });
  });

  it("detects inconsistent payloads reported by metrics for the same case", () => {
    const cases = groupRunCases([
      evaluation({ id: "one" }),
      evaluation({ id: "two", payload: { input: "changed" } }),
    ]);

    expect(cases[0]?.payloadConsistent).toBe(false);
  });

  it.each([
    ["invalid", "invalid"],
    ["unknown", "unknown"],
    ["pass", "pass"],
  ] as const)("uses %s outcome precedence when no failure exists", (outcome, expected) => {
    expect(groupRunCases([evaluation({ outcome })])[0]?.outcome).toBe(expected);
  });

  it("compares matching, added, and removed metrics", () => {
    const comparison = compareMetrics(
      [metric("quality", 0.9, 0.8), metric("new", 1, null)],
      [metric("quality", 0.7, 0.5), metric("removed", 0.5, null)],
    );
    expect(comparison).toHaveLength(3);
    expect(comparison[0]).toMatchObject({ metricName: "new", baseline: null, passRateDelta: null });
    expect(comparison[1]?.metricName).toBe("quality");
    expect(comparison[1]?.passRateDelta).toBeCloseTo(0.2);
    expect(comparison[1]?.averageScoreDelta).toBeCloseTo(0.3);
    expect(comparison[2]).toMatchObject({
      metricName: "removed",
      candidate: null,
      averageScoreDelta: null,
    });
  });

  it("classifies case regressions, new failures, improvements, and removals", () => {
    const candidate = [
      evaluation({ id: "regressed", caseId: "regressed", outcome: "fail" }),
      evaluation({
        id: "new",
        caseId: "new",
        outcome: "invalid",
        numericValue: null,
        categoricalValue: "bad",
      }),
      evaluation({ id: "improved", caseId: "improved", outcome: "pass" }),
      evaluation({ id: "unchanged", caseId: "unchanged", outcome: "pass" }),
    ];
    const baseline = [
      evaluation({ id: "regressed-old", caseId: "regressed", outcome: "pass" }),
      evaluation({ id: "improved-old", caseId: "improved", outcome: "fail" }),
      evaluation({ id: "removed", caseId: "removed", outcome: "pass" }),
      evaluation({ id: "unchanged-old", caseId: "unchanged", outcome: "pass" }),
    ];
    expect(compareCases(candidate, baseline).map((item) => item.classification)).toEqual([
      "regressed",
      "new_failure",
      "improved",
      "removed",
    ]);
  });

  it("calculates absolute and percentage comparison values safely", () => {
    expect(comparisonValue(12, 10)).toEqual({
      candidate: 12,
      baseline: 10,
      delta: 2,
      percentChange: 20,
    });
    expect(comparisonValue(null, 10).percentChange).toBeNull();
    expect(comparisonValue(10, 0).percentChange).toBeNull();
  });
});

function metric(metricName: string, passRate: number, averageNumericValue: number | null) {
  return {
    metricName,
    results: 1,
    passed: 1,
    failed: 0,
    invalid: 0,
    unknown: 0,
    passRate,
    averageNumericValue,
  };
}

function evaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    id: "result-1",
    runId: "run-1",
    timestamp: "2026-08-07T00:00:00.000Z",
    traceId: "1234567890abcdef1234567890abcdef",
    observationId: "1234567890abcdef",
    responseId: null,
    suiteName: "support",
    caseId: "case-1",
    metricName: "quality",
    outcome: "pass",
    dataType: "BOOLEAN",
    numericValue: 1,
    categoricalValue: null,
    explanation: "Looks good",
    payload: { input: "question", expected: "answer", output: "answer" },
    payloadStatus: "captured",
    configId: null,
    serviceName: "test",
    environment: "test",
    release: null,
    metadata: {},
    source: "telemetry",
    reviewer: null,
    expiresAt: null,
    ingestedAt: "2026-08-07T00:00:00.000Z",
    ingestVersion: "1",
    ...overrides,
  };
}
