import type {
  EvaluationMetricBreakdown,
  EvaluationRunComparison,
  EvaluationRunSummary,
  QualityGate,
} from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { evaluateQualityGate } from "../src/modules/quality-gates/evaluate.js";

describe("quality gate evaluation", () => {
  it("passes quality and operational regression rules", () => {
    const result = evaluateQualityGate(gate(), comparison());
    expect(result.verdict).toBe("pass");
    expect(result.rules.every((rule) => rule.verdict === "pass")).toBe(true);
  });

  it("fails when an evaluation threshold is missed", () => {
    const input = comparison();
    const metric = input.metrics[0]?.candidate;
    if (metric !== null && metric !== undefined) metric.passRate = 0.7;
    expect(evaluateQualityGate(gate(), input).verdict).toBe("fail");
  });

  it("returns insufficient data for incomplete operational trace coverage", () => {
    const input = comparison();
    input.candidate.traceCoverage = 0.5;
    const result = evaluateQualityGate(gate(), input);
    expect(result.verdict).toBe("insufficient_data");
    expect(result.rules).toContainEqual(
      expect.objectContaining({
        verdict: "insufficient_data",
        message: "Complete trace coverage is required",
      }),
    );
  });
});

function gate(): QualityGate {
  return {
    id: "gate-1",
    projectId: "project-1",
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
      {
        type: "evaluation_regression",
        metricName: "correctness",
        measure: "average_score",
        direction: "decrease",
        maxAbsoluteChange: 0.1,
      },
      {
        type: "operational_regression",
        measure: "p95_latency_ms",
        maxIncreasePercent: 15,
      },
    ],
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
  };
}

function comparison(): Omit<EvaluationRunComparison, "gate"> {
  const candidate = run("candidate", 0.95, 105, 110);
  const baseline = run("baseline", 0.9, 100, 100);
  return {
    candidate,
    baseline,
    passRate: { candidate: 0.95, baseline: 0.9, delta: 0.05, percentChange: 5.56 },
    p95LatencyMs: { candidate: 105, baseline: 100, delta: 5, percentChange: 5 },
    averageTotalTokens: { candidate: 110, baseline: 100, delta: 10, percentChange: 10 },
    metrics: [
      {
        metricName: "correctness",
        candidate: metric(0.95, 0.86),
        baseline: metric(0.9, 0.9),
        passRateDelta: 0.05,
        averageScoreDelta: -0.04,
      },
    ],
    caseChanges: [],
    caseChangeCounts: { regressed: 0, improved: 0, new_failure: 0, removed: 0 },
    warnings: [],
  };
}

function run(id: string, passRate: number, latency: number, tokens: number): EvaluationRunSummary {
  return {
    projectId: "project-1",
    id,
    status: "completed",
    suiteName: "support",
    startedAt: "2026-08-07T00:00:00.000Z",
    completedAt: "2026-08-07T00:00:01.000Z",
    durationMs: 1_000,
    caseCount: 20,
    metricNames: ["correctness"],
    passed: 19,
    failed: 1,
    invalid: 0,
    serviceName: "support-agent",
    environment: "production",
    release: id,
    datasetName: "support",
    datasetVersion: "v1",
    metadata: {},
    expiresAt: null,
    ingestedAt: "2026-08-07T00:00:02.000Z",
    ingestVersion: "1",
    stateVersion: 2,
    results: 20,
    actualPassed: 19,
    actualFailed: 1,
    actualInvalid: 0,
    actualUnknown: 0,
    passRate,
    evaluatedCases: 20,
    evaluatedTraces: 20,
    p95LatencyMs: latency,
    averageTotalTokens: tokens,
    traceCoverage: 1,
  };
}

function metric(passRate: number, averageNumericValue: number): EvaluationMetricBreakdown {
  return {
    metricName: "correctness",
    results: 20,
    passed: Math.round(passRate * 20),
    failed: 20 - Math.round(passRate * 20),
    invalid: 0,
    unknown: 0,
    passRate,
    averageNumericValue,
  };
}
