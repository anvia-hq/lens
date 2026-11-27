import type {
  EvaluationCaseChange,
  EvaluationMetricBreakdown,
  EvaluationMetricComparison,
  EvaluationResult,
  EvaluationRunCaseTrial,
  EvaluationRunDetail,
} from "@lens/contracts";

function aggregateOutcome(items: EvaluationResult[]): EvaluationResult["outcome"] {
  const outcomes = new Set(items.map((item) => item.outcome));
  return outcomes.has("fail")
    ? "fail"
    : outcomes.has("invalid")
      ? "invalid"
      : outcomes.has("unknown")
        ? "unknown"
        : "pass";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPayloadConsistent(items: EvaluationResult[]): boolean {
  const payloads = items.flatMap((item) =>
    item.payload === null ? [] : [stableJson(item.payload)],
  );
  return new Set(payloads).size <= 1;
}

function sortMetricResults(items: EvaluationResult[]): EvaluationResult[] {
  return items.toSorted(
    (left, right) =>
      (left.trial ?? 0) - (right.trial ?? 0) ||
      left.metricName.localeCompare(right.metricName) ||
      left.id.localeCompare(right.id),
  );
}

export function groupRunCases(results: EvaluationResult[]): EvaluationRunDetail["cases"] {
  const groups = new Map<string, EvaluationResult[]>();
  for (const result of results) {
    const key = result.caseId ?? "\u0000";
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return Array.from(groups.values())
    .map((items) => {
      const sortedResults = sortMetricResults(items);
      const hasTrials = sortedResults.some((item) => item.trial !== null);
      const trialGroups = new Map<number, EvaluationResult[]>();
      const untrialedItems: EvaluationResult[] = [];
      for (const item of sortedResults) {
        if (item.trial !== null) {
          trialGroups.set(item.trial, [...(trialGroups.get(item.trial) ?? []), item]);
        } else {
          untrialedItems.push(item);
        }
      }

      const trials: EvaluationRunCaseTrial[] = hasTrials
        ? Array.from(trialGroups.entries())
            .toSorted(([left], [right]) => left - right)
            .map(([trial, trialItems]) => {
              const trialPayloadItem =
                trialItems.find((item) => item.payload !== null) ?? trialItems[0];
              return {
                trial,
                outcome: aggregateOutcome(trialItems),
                traceId: trialItems.find((item) => item.traceId !== null)?.traceId ?? null,
                cached: trialItems.some((item) => item.cached === true),
                payload: trialPayloadItem?.payload ?? null,
                payloadStatus: trialPayloadItem?.payloadStatus ?? "not_requested",
                payloadConsistent: isPayloadConsistent(trialItems),
                results: sortMetricResults(trialItems),
              };
            })
        : [];

      const payloadItem =
        trials.find((trial) => trial.payload !== null) ??
        sortedResults.find((item) => item.payload !== null) ??
        trials[0] ??
        sortedResults[0];

      const payloadConsistent = hasTrials
        ? trials.every((trial) => trial.payloadConsistent) &&
          (untrialedItems.length === 0 || isPayloadConsistent(untrialedItems))
        : isPayloadConsistent(sortedResults);

      const distinctTraceIds = Array.from(
        new Set(
          (hasTrials ? trials.map((trial) => trial.traceId) : [])
            .concat(sortedResults.map((item) => item.traceId))
            .filter((traceId): traceId is string => traceId !== null),
        ),
      );

      const maxConfiguredTrialCount = sortedResults.reduce(
        (highest, item) =>
          item.trialCount === null ? highest : Math.max(highest, item.trialCount),
        0,
      );
      const maxTrial = trials.reduce((highest, trial) => Math.max(highest, trial.trial), 0);
      const trialCount = hasTrials
        ? Math.max(maxConfiguredTrialCount, maxTrial, trials.length)
        : maxConfiguredTrialCount > 0
          ? maxConfiguredTrialCount
          : null;
      const passedTrials = trials.filter((trial) => trial.outcome === "pass").length;

      return {
        caseId: sortedResults[0]?.caseId ?? null,
        outcome: aggregateOutcome(sortedResults),
        traceId: distinctTraceIds[0] ?? null,
        traceIds: distinctTraceIds,
        payload: payloadItem?.payload ?? null,
        payloadStatus: payloadItem?.payloadStatus ?? "not_requested",
        payloadConsistent,
        trialCount,
        trials,
        passedTrials,
        cached: sortedResults.some((item) => item.cached === true),
        results: sortedResults,
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
