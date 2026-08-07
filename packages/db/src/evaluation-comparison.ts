import type {
  EvaluationCaseChange,
  EvaluationMetricBreakdown,
  EvaluationMetricComparison,
  EvaluationResult,
  EvaluationRunDetail,
} from "@lens/contracts";

export function groupRunCases(results: EvaluationResult[]): EvaluationRunDetail["cases"] {
  const groups = new Map<string, EvaluationResult[]>();
  for (const result of results) {
    const key = result.caseId ?? "\u0000";
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return Array.from(groups.values())
    .map((items) => {
      const payloads = items.flatMap((item) =>
        item.payload === null ? [] : [JSON.stringify(item.payload)],
      );
      const payloadItem = items.find((item) => item.payload !== null) ?? items[0];
      const outcomes = new Set(items.map((item) => item.outcome));
      const outcome: EvaluationResult["outcome"] = outcomes.has("fail")
        ? "fail"
        : outcomes.has("invalid")
          ? "invalid"
          : outcomes.has("unknown")
            ? "unknown"
            : "pass";
      return {
        caseId: items[0]?.caseId ?? null,
        outcome,
        traceId: items.find((item) => item.traceId !== null)?.traceId ?? null,
        payload: payloadItem?.payload ?? null,
        payloadStatus: payloadItem?.payloadStatus ?? "not_requested",
        payloadConsistent: new Set(payloads).size <= 1,
        results: items.toSorted(
          (left, right) =>
            left.metricName.localeCompare(right.metricName) || left.id.localeCompare(right.id),
        ),
      };
    })
    .toSorted((left, right) => (left.caseId ?? "").localeCompare(right.caseId ?? ""));
}

export function compareMetrics(
  candidate: EvaluationMetricBreakdown[],
  baseline: EvaluationMetricBreakdown[],
): EvaluationMetricComparison[] {
  const candidateMap = new Map(candidate.map((item) => [item.metricName, item]));
  const baselineMap = new Map(baseline.map((item) => [item.metricName, item]));
  return Array.from(new Set([...candidateMap.keys(), ...baselineMap.keys()]))
    .toSorted()
    .map((metricName) => {
      const current = candidateMap.get(metricName) ?? null;
      const previous = baselineMap.get(metricName) ?? null;
      return {
        metricName,
        candidate: current,
        baseline: previous,
        passRateDelta:
          current === null || previous === null ? null : current.passRate - previous.passRate,
        averageScoreDelta:
          current?.averageNumericValue === null ||
          current?.averageNumericValue === undefined ||
          previous?.averageNumericValue === null ||
          previous?.averageNumericValue === undefined
            ? null
            : current.averageNumericValue - previous.averageNumericValue,
      };
    });
}

export function compareCases(
  candidate: EvaluationResult[],
  baseline: EvaluationResult[],
): EvaluationCaseChange[] {
  const key = (item: EvaluationResult) => `${item.caseId ?? ""}\u0000${item.metricName}`;
  const current = new Map(candidate.map((item) => [key(item), item]));
  const previous = new Map(baseline.map((item) => [key(item), item]));
  const changes: EvaluationCaseChange[] = [];
  for (const caseKey of new Set([...current.keys(), ...previous.keys()])) {
    const candidateResult = current.get(caseKey);
    const baselineResult = previous.get(caseKey);
    let classification: EvaluationCaseChange["classification"] | undefined;
    if (candidateResult === undefined) classification = "removed";
    else if (baselineResult === undefined && isFailure(candidateResult))
      classification = "new_failure";
    else if (
      baselineResult !== undefined &&
      isFailure(candidateResult) &&
      !isFailure(baselineResult)
    ) {
      classification = "regressed";
    } else if (
      candidateResult !== undefined &&
      baselineResult !== undefined &&
      !isFailure(candidateResult) &&
      isFailure(baselineResult)
    ) {
      classification = "improved";
    }
    if (classification === undefined) continue;
    const item = candidateResult ?? baselineResult;
    if (item === undefined) continue;
    changes.push({
      caseId: item.caseId ?? "unspecified",
      metricName: item.metricName,
      classification,
      candidateOutcome: candidateResult?.outcome ?? null,
      baselineOutcome: baselineResult?.outcome ?? null,
      candidateValue: resultValue(candidateResult),
      baselineValue: resultValue(baselineResult),
      candidateTraceId: candidateResult?.traceId ?? null,
      baselineTraceId: baselineResult?.traceId ?? null,
    });
  }
  const order = { regressed: 0, new_failure: 1, improved: 2, removed: 3 } as const;
  return changes.toSorted(
    (left, right) =>
      order[left.classification] - order[right.classification] ||
      left.caseId.localeCompare(right.caseId),
  );
}

export function comparisonValue(candidate: number | null, baseline: number | null) {
  const delta = candidate === null || baseline === null ? null : candidate - baseline;
  return {
    candidate,
    baseline,
    delta,
    percentChange:
      delta === null || baseline === null || baseline === 0 ? null : (delta / baseline) * 100,
  };
}

function resultValue(result: EvaluationResult | undefined): number | string | null {
  return result?.numericValue ?? result?.categoricalValue ?? null;
}

function isFailure(result: EvaluationResult | undefined): boolean {
  return result?.outcome === "fail" || result?.outcome === "invalid";
}
