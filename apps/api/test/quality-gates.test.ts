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

  it("preserves legacy semantics but rejects one pass and 99 invalid judgments with evidence enabled", () => {
    const input = comparison();
    input.candidate.evaluatedCases = 100;
    input.metrics[0]!.candidate = {
      ...metric(1, 1),
      results: 100,
      passed: 1,
      failed: 0,
      invalid: 99,
      validCaseCount: 1,
    };
    const policy = evidenceGate();
    policy.minimumCaseCount = 100;
    const legacy = {
      ...policy,
      rules: policy.rules.map(({ evidence: _evidence, ...rule }) => rule),
    };
    expect(evaluateQualityGate(legacy, input).verdict).toBe("pass");
    expect(evaluateQualityGate(policy, input).verdict).toBe("insufficient_data");
  });

  it.each([
    { invalid: 2, unknown: 2, maximum: 0.1, verdict: "pass" },
    { invalid: 3, unknown: 0, maximum: 0.1, verdict: "insufficient_data" },
    { invalid: 0, unknown: 3, maximum: 0.1, verdict: "insufficient_data" },
    { invalid: 20, unknown: 0, maximum: 1, verdict: "insufficient_data" },
    { invalid: 0, unknown: 20, maximum: 1, verdict: "insufficient_data" },
  ])("enforces separate invalid/unknown budgets: %j", ({ invalid, unknown, maximum, verdict }) => {
    const input = comparison();
    const usable = 20 - invalid - unknown;
    input.metrics[0]!.candidate = {
      ...metric(1, 1),
      invalid,
      unknown,
      passed: usable,
      failed: 0,
      validCaseCount: usable,
    };
    const policy = evidenceGate();
    policy.rules[0]!.evidence = {
      minimumValidCases: 1,
      maxInvalidRate: maximum,
      maxUnknownRate: maximum,
    };
    expect(evaluateQualityGate(policy, input).verdict).toBe(verdict);
  });

  it("does not let unrelated metric coverage or repeated judgments satisfy distinct-case evidence", () => {
    const input = comparison();
    input.candidate.evaluatedCases = 100;
    input.metrics[0]!.candidate = {
      ...metric(1, 1),
      results: 100,
      passed: 100,
      failed: 0,
      validCaseCount: 1,
    };
    expect(evaluateQualityGate(evidenceGate(), input).verdict).toBe("insufficient_data");
  });

  it("accepts valid negative controls for an at-most pass-rate rule", () => {
    const input = comparison();
    input.metrics[0]!.candidate = { ...metric(0, 0), validCaseCount: 20 };
    const policy = evidenceGate();
    policy.rules[0]!.operator = "lte";
    policy.rules[0]!.value = 0.05;
    expect(evaluateQualityGate(policy, input).verdict).toBe("pass");
  });

  it("requires score-bearing cases and uses only usable numeric scores", () => {
    const input = comparison();
    input.metrics[0]!.candidate = {
      ...metric(1, 100),
      validCaseCount: 20,
      validScoreCaseCount: 1,
      averageValidScore: 0.1,
    };
    const policy = evidenceGate();
    policy.rules[0]!.measure = "average_score";
    expect(evaluateQualityGate(policy, input).verdict).toBe("insufficient_data");
    input.metrics[0]!.candidate!.validScoreCaseCount = 20;
    expect(evaluateQualityGate(policy, input).rules[1]?.message).toContain("valid average score");
    expect(evaluateQualityGate(policy, input).verdict).toBe("fail");
    policy.rules[0]!.operator = "lte";
    expect(evaluateQualityGate(policy, input).verdict).toBe("pass");
  });

  it("requires usable evidence on the baseline as well for regression rules", () => {
    const input = comparison();
    input.metrics[0]!.candidate = { ...metric(1, 1), validCaseCount: 20 };
    input.metrics[0]!.baseline = { ...metric(1, 1), validCaseCount: 1 };
    const policy: QualityGate = {
      ...gate(),
      rules: [
        {
          type: "evaluation_regression",
          metricName: "correctness",
          measure: "pass_rate",
          direction: "decrease",
          maxAbsoluteChange: 0.1,
          evidence: { minimumValidCases: 10, maxInvalidRate: 0, maxUnknownRate: 0 },
        },
      ],
    };
    expect(evaluateQualityGate(policy, input).rules[1]?.message).toContain(
      "Baseline correctness has 1 valid cases",
    );
    input.metrics[0]!.baseline!.validCaseCount = 20;
    expect(evaluateQualityGate(policy, input).verdict).toBe("pass");
  });

  it("fails closed if evidence aggregates are absent", () => {
    expect(evaluateQualityGate(evidenceGate(), comparison()).verdict).toBe("insufficient_data");
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
    promptName: "support/reply",
    promptVersion: "5",
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

function evidenceGate() {
  return {
    ...gate(),
    rules: [
      {
        type: "evaluation_threshold" as const,
        metricName: "correctness",
        measure: "pass_rate" as "pass_rate" | "average_score",
        operator: "gte" as "gte" | "lte",
        value: 0.95,
        evidence: { minimumValidCases: 10, maxInvalidRate: 0, maxUnknownRate: 0 },
      },
    ],
  };
}
