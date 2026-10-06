import type {
  EvaluationMetricComparison,
  EvaluationMetricBreakdown,
  EvaluationRunAggregateComparison,
  QualityGate,
  QualityGateEvaluation,
  QualityGateRule,
  QualityGateRuleResult,
} from "@lens/contracts";

export function evaluateQualityGate(
  gate: QualityGate,
  comparison: Omit<EvaluationRunAggregateComparison, "gate">,
): QualityGateEvaluation {
  const rules: QualityGateRuleResult[] = [
    comparison.candidate.evaluatedCases < gate.minimumCaseCount
      ? result(
          { type: "minimum_case_count", value: gate.minimumCaseCount },
          "insufficient_data",
          `Candidate has ${comparison.candidate.evaluatedCases} cases; ${gate.minimumCaseCount} required`,
          comparison.candidate.evaluatedCases,
          null,
        )
      : result(
          { type: "minimum_case_count", value: gate.minimumCaseCount },
          "pass",
          `Candidate has ${comparison.candidate.evaluatedCases} cases`,
          comparison.candidate.evaluatedCases,
          null,
        ),
    ...gate.rules.map((rule) => evaluateRule(rule, comparison)),
  ];
  const verdict = rules.some((item) => item.verdict === "fail")
    ? "fail"
    : rules.some((item) => item.verdict === "insufficient_data")
      ? "insufficient_data"
      : "pass";
  return { gate, verdict, rules };
}

function evaluateRule(
  rule: QualityGateRule,
  comparison: Omit<EvaluationRunAggregateComparison, "gate">,
): QualityGateRuleResult {
  if (rule.type === "operational_regression") {
    if (comparison.candidate.traceCoverage < 1 || comparison.baseline.traceCoverage < 1) {
      return result(rule, "insufficient_data", "Complete trace coverage is required", null, null);
    }
    const values =
      rule.measure === "p95_latency_ms" ? comparison.p95LatencyMs : comparison.averageTotalTokens;
    if (values.candidate === null || values.baseline === null || values.baseline <= 0) {
      return result(
        rule,
        "insufficient_data",
        "Candidate and positive baseline values are required",
        values.candidate,
        values.baseline,
      );
    }
    const increase = ((values.candidate - values.baseline) / values.baseline) * 100;
    const verdict = increase <= rule.maxIncreasePercent ? "pass" : "fail";
    return result(
      rule,
      verdict,
      `${label(rule.measure)} changed by ${increase.toFixed(1)}% (maximum +${rule.maxIncreasePercent}%)`,
      values.candidate,
      values.baseline,
    );
  }

  const metric = comparison.metrics.find((item) => item.metricName === rule.metricName);
  if (metric === undefined) {
    return result(
      rule,
      "insufficient_data",
      `Metric ${rule.metricName} is unavailable`,
      null,
      null,
    );
  }
  if (rule.evidence !== undefined) {
    const candidateIssue = evidenceIssue(metric.candidate, rule, "Candidate");
    const baselineIssue =
      rule.type === "evaluation_regression"
        ? evidenceIssue(metric.baseline, rule, "Baseline")
        : null;
    const issue = candidateIssue ?? baselineIssue;
    if (issue !== null) return result(rule, "insufficient_data", issue, null, null);
  }
  const measureLabel =
    rule.evidence !== undefined && rule.measure === "average_score"
      ? "valid average score"
      : label(rule.measure);
  const values = metricValues(metric, rule.measure, rule.evidence !== undefined);
  if (values.candidate === null) {
    return result(
      rule,
      "insufficient_data",
      `Candidate ${measureLabel} is unavailable`,
      null,
      values.baseline,
    );
  }
  if (rule.type === "evaluation_threshold") {
    const passed =
      rule.operator === "gte" ? values.candidate >= rule.value : values.candidate <= rule.value;
    return result(
      rule,
      passed ? "pass" : "fail",
      `${rule.metricName} ${measureLabel} is ${format(values.candidate)}; must be ${rule.operator} ${format(rule.value)}`,
      values.candidate,
      values.baseline,
    );
  }
  if (values.baseline === null) {
    return result(
      rule,
      "insufficient_data",
      `Baseline ${measureLabel} is unavailable`,
      values.candidate,
      null,
    );
  }
  const change = values.candidate - values.baseline;
  const regression = rule.direction === "decrease" ? -change : change;
  const passed = regression <= rule.maxAbsoluteChange;
  return result(
    rule,
    passed ? "pass" : "fail",
    `${rule.metricName} ${measureLabel} changed by ${format(change)}; maximum ${rule.direction} is ${format(rule.maxAbsoluteChange)}`,
    values.candidate,
    values.baseline,
  );
}

function evidenceIssue(
  metric: EvaluationMetricBreakdown | null,
  rule: Exclude<QualityGateRule, { type: "operational_regression" }>,
  side: string,
): string | null {
  const evidence = rule.evidence;
  if (evidence === undefined) return null;
  const count = rule.measure === "pass_rate" ? metric?.validCaseCount : metric?.validScoreCaseCount;
  if (count === undefined || count < evidence.minimumValidCases) {
    return `${side} ${rule.metricName} has ${count ?? 0} valid cases for ${label(rule.measure)}; ${evidence.minimumValidCases} required`;
  }
  if (metric === null || metric.results <= 0) return `${side} ${rule.metricName} has no judgments`;
  for (const [outcome, maximum] of [
    ["invalid", evidence.maxInvalidRate],
    ["unknown", evidence.maxUnknownRate],
  ] as const) {
    const rate = metric[outcome] / metric.results;
    if (rate > maximum)
      return `${side} ${rule.metricName} ${outcome} rate is ${format(rate * 100)}%; maximum ${format(maximum * 100)}%`;
  }
  return null;
}

function metricValues(
  metric: EvaluationMetricComparison,
  measure: "pass_rate" | "average_score",
  requireEvidence: boolean,
): { candidate: number | null; baseline: number | null } {
  if (measure === "pass_rate") {
    return {
      candidate:
        metric.candidate === null || metric.candidate.passed + metric.candidate.failed === 0
          ? null
          : metric.candidate.passRate,
      baseline:
        metric.baseline === null || metric.baseline.passed + metric.baseline.failed === 0
          ? null
          : metric.baseline.passRate,
    };
  }
  return {
    candidate:
      (requireEvidence
        ? metric.candidate?.averageValidScore
        : metric.candidate?.averageNumericValue) ?? null,
    baseline:
      (requireEvidence
        ? metric.baseline?.averageValidScore
        : metric.baseline?.averageNumericValue) ?? null,
  };
}

function result(
  rule: QualityGateRuleResult["rule"],
  verdict: QualityGateRuleResult["verdict"],
  message: string,
  candidateValue: number | null,
  baselineValue: number | null,
): QualityGateRuleResult {
  return { rule, verdict, message, candidateValue, baselineValue };
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}
