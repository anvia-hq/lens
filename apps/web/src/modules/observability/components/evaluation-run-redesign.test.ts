import type {
  EvaluationCaseChange,
  EvaluationMetricComparison,
  EvaluationOutcome,
  EvaluationRunCaseDetail,
  EvaluationRunSummary,
} from "@lens/contracts";
import { describe, expect, it } from "vitest";
import {
  comparisonDeltaTone,
  filterCaseChanges,
  includeFallbackCandidate,
  sortMetricComparisons,
} from "./evaluation-compare-view";
import { filterEvaluationCases, sortEvaluationCases } from "./evaluation-run-detail-view";

describe("evaluation run detail diagnosis helpers", () => {
  it("prioritizes failed and unresolved cases while preserving order within an outcome", () => {
    const cases = [
      evaluationCase("pass-1", "pass"),
      evaluationCase("fail-1", "fail"),
      evaluationCase("unknown-1", "unknown"),
      evaluationCase("fail-2", "fail"),
      evaluationCase("invalid-1", "invalid"),
    ];

    expect(sortEvaluationCases(cases).map((item) => item.caseId)).toEqual([
      "fail-1",
      "fail-2",
      "invalid-1",
      "unknown-1",
      "pass-1",
    ]);
  });

  it("filters cases by outcome, case ID, and metric name", () => {
    const cases = [
      evaluationCase("billing-case", "fail", "accuracy"),
      evaluationCase("support-case", "pass", "helpfulness"),
    ];

    expect(filterEvaluationCases(cases, "accuracy", "all")).toHaveLength(1);
    expect(filterEvaluationCases(cases, "support", "pass")[0]?.caseId).toBe("support-case");
    expect(filterEvaluationCases(cases, "support", "fail")).toEqual([]);
  });
});

describe("evaluation comparison regression helpers", () => {
  it("interprets delta direction according to the metric", () => {
    expect(comparisonDeltaTone({ delta: 0.05 }, true)).toBe("positive");
    expect(comparisonDeltaTone({ delta: -0.05 }, true)).toBe("negative");
    expect(comparisonDeltaTone({ delta: -100 }, false)).toBe("positive");
    expect(comparisonDeltaTone({ delta: 100 }, false)).toBe("negative");
    expect(comparisonDeltaTone({ delta: null }, false)).toBe("neutral");
  });

  it("groups changed cases into regression-focused tabs", () => {
    const changes = [
      caseChange("regressed"),
      caseChange("new_failure"),
      caseChange("improved"),
      caseChange("removed"),
    ];

    expect(filterCaseChanges(changes, "regressions").map((item) => item.classification)).toEqual([
      "regressed",
      "new_failure",
    ]);
    expect(filterCaseChanges(changes, "improvements")).toEqual([changes[2]]);
    expect(filterCaseChanges(changes, "removed")).toEqual([changes[3]]);
    expect(filterCaseChanges(changes, "all")).toEqual(changes);
  });

  it("orders the strongest pass-rate regressions before improvements and missing metrics", () => {
    const metrics = [
      metricComparison("missing", null),
      metricComparison("improved", 0.1),
      metricComparison("regressed", -0.2),
      metricComparison("flat", 0),
    ];

    expect(sortMetricComparisons(metrics).map((metric) => metric.metricName)).toEqual([
      "regressed",
      "flat",
      "improved",
      "missing",
    ]);
  });

  it("keeps an older preselected candidate available without duplicating listed runs", () => {
    const listed = [{ id: "recent" }] as EvaluationRunSummary[];
    const older = { id: "older" } as EvaluationRunSummary;

    expect(includeFallbackCandidate(listed, older).map((run) => run.id)).toEqual([
      "older",
      "recent",
    ]);
    expect(includeFallbackCandidate(listed, listed[0])).toBe(listed);
  });
});

function evaluationCase(
  caseId: string,
  outcome: EvaluationOutcome,
  metricName = "quality",
): EvaluationRunCaseDetail {
  return {
    caseId,
    outcome,
    traceId: null,
    payload: null,
    payloadStatus: "not_requested",
    payloadConsistent: true,
    results: [{ metricName }] as EvaluationRunCaseDetail["results"],
  };
}

function caseChange(classification: EvaluationCaseChange["classification"]): EvaluationCaseChange {
  return {
    caseId: `case-${classification}`,
    metricName: "quality",
    classification,
    candidateOutcome: null,
    baselineOutcome: null,
    candidateValue: null,
    baselineValue: null,
    candidateTraceId: null,
    baselineTraceId: null,
  };
}

function metricComparison(
  metricName: string,
  passRateDelta: number | null,
): EvaluationMetricComparison {
  return {
    metricName,
    candidate: null,
    baseline: null,
    passRateDelta,
    averageScoreDelta: null,
  };
}
