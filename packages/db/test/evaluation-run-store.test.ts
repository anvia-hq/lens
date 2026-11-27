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

  it("detects inconsistent payloads reported by metrics for the same single-trial case", () => {
    const cases = groupRunCases([
      evaluation({ id: "one" }),
      evaluation({ id: "two", payload: { input: "changed" } }),
    ]);

    expect(cases[0]?.payloadConsistent).toBe(false);
    expect(cases[0]?.trials).toEqual([]);
    expect(cases[0]?.trialCount).toBeNull();
  });

  it("groups multi-trial cases by trial and does not flag different outputs across trials as inconsistent", () => {
    const trace1 = "11111111111111111111111111111111";
    const trace2 = "22222222222222222222222222222222";
    const trace3 = "33333333333333333333333333333333";
    const cases = groupRunCases([
      evaluation({
        id: "t3-contains",
        trial: 3,
        trialCount: 3,
        traceId: trace3,
        metricName: "contains",
        outcome: "pass",
        payload: { input: "q", expected: "a", output: "answer-3" },
      }),
      evaluation({
        id: "t1-contains",
        trial: 1,
        trialCount: 3,
        cached: true,
        traceId: trace1,
        metricName: "contains",
        outcome: "pass",
        payload: { input: "q", expected: "a", output: "answer-1" },
      }),
      evaluation({
        id: "t1-judge",
        trial: 1,
        trialCount: 3,
        cached: true,
        traceId: trace1,
        metricName: "faithfulness",
        metricProvider: "openai",
        metricModel: "gpt-4.1",
        outcome: "pass",
        payload: { input: "q", expected: "a", output: "answer-1" },
      }),
      evaluation({
        id: "t2-contains",
        trial: 2,
        trialCount: 3,
        traceId: trace2,
        metricName: "contains",
        outcome: "fail",
        payload: { input: "q", expected: "a", output: "answer-2" },
      }),
      evaluation({
        id: "t2-judge",
        trial: 2,
        trialCount: 3,
        traceId: trace2,
        metricName: "faithfulness",
        metricProvider: "openai",
        metricModel: "gpt-4.1",
        outcome: "pass",
        payload: { input: "q", expected: "a", output: "answer-2" },
      }),
      evaluation({
        id: "t3-judge",
        trial: 3,
        trialCount: 3,
        traceId: trace3,
        metricName: "faithfulness",
        metricProvider: "openai",
        metricModel: "gpt-4.1",
        outcome: "pass",
        payload: { input: "q", expected: "a", output: "answer-3" },
      }),
    ]);

    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseId: "case-1",
      outcome: "fail",
      payloadConsistent: true,
      trialCount: 3,
      passedTrials: 2,
      cached: true,
      traceId: trace1,
      traceIds: [trace1, trace2, trace3],
    });
    expect(cases[0]?.trials?.map((trial) => trial.trial)).toEqual([1, 2, 3]);
    expect(cases[0]?.trials?.[0]).toMatchObject({
      trial: 1,
      outcome: "pass",
      traceId: trace1,
      cached: true,
      payloadConsistent: true,
      payload: { input: "q", expected: "a", output: "answer-1" },
    });
    expect(cases[0]?.trials?.[1]).toMatchObject({
      trial: 2,
      outcome: "fail",
      traceId: trace2,
      cached: false,
      payloadConsistent: true,
      payload: { input: "q", expected: "a", output: "answer-2" },
    });
    expect(cases[0]?.trials?.[2]).toMatchObject({
      trial: 3,
      outcome: "pass",
      traceId: trace3,
      payloadConsistent: true,
      payload: { input: "q", expected: "a", output: "answer-3" },
    });
  });

  it("flags inconsistent payloads only for the trial whose metrics disagree", () => {
    const trace1 = "11111111111111111111111111111111";
    const trace2 = "22222222222222222222222222222222";
    const cases = groupRunCases([
      evaluation({
        id: "t1-m1",
        trial: 1,
        trialCount: 2,
        traceId: trace1,
        metricName: "contains",
        payload: { input: "q", output: "same-output" },
      }),
      evaluation({
        id: "t1-m2",
        trial: 1,
        trialCount: 2,
        traceId: trace1,
        metricName: "judge",
        payload: { input: "q", output: "same-output" },
      }),
      evaluation({
        id: "t2-m1",
        trial: 2,
        trialCount: 2,
        traceId: trace2,
        metricName: "contains",
        payload: { input: "q", output: "trial-2-output-a" },
      }),
      evaluation({
        id: "t2-m2",
        trial: 2,
        trialCount: 2,
        traceId: trace2,
        metricName: "judge",
        payload: { input: "q", output: "trial-2-output-b" },
      }),
    ]);

    expect(cases[0]?.payloadConsistent).toBe(false);
    expect(cases[0]?.trials?.[0]?.payloadConsistent).toBe(true);
    expect(cases[0]?.trials?.[1]?.payloadConsistent).toBe(false);
  });

  it("handles partial trial slices without trialCount, mixed untrialed payloads, and key-order-independent payloads", () => {
    const partialSlice = groupRunCases([
      evaluation({
        id: "t2-m1",
        trial: 2,
        trialCount: null,
        payload: { input: { b: 2, a: 1 }, output: "ok" },
      }),
      evaluation({
        id: "t2-m2",
        trial: 2,
        trialCount: null,
        payload: { output: "ok", input: { a: 1, b: 2 } },
      }),
      evaluation({
        id: "t3-m1",
        trial: 3,
        trialCount: null,
        payload: null,
        payloadStatus: "not_requested",
      }),
    ]);
    expect(partialSlice[0]).toMatchObject({
      trialCount: 3,
      payloadConsistent: true,
    });

    const mixedPayloadFallback = groupRunCases([
      evaluation({
        id: "t1",
        trial: 1,
        trialCount: 2,
        payload: null,
        payloadStatus: "not_requested",
      }),
      evaluation({
        id: "case-level",
        trial: null,
        trialCount: null,
        payload: { input: "case-input", output: "case-output" },
        payloadStatus: "captured",
      }),
    ]);
    expect(mixedPayloadFallback[0]).toMatchObject({
      payload: { input: "case-input", output: "case-output" },
      payloadStatus: "captured",
      payloadConsistent: true,
    });
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
    trial: null,
    trialCount: null,
    cached: null,
    metricName: "quality",
    metricProvider: null,
    metricModel: null,
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
