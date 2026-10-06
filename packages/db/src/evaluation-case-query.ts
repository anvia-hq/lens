import { readCancellation } from "./read-cancellation.js";
import type { ClickHouseClient } from "@clickhouse/client";
import type { EvaluationCaseChange, EvaluationRunComparison } from "@lens/contracts";

type CaseChangeRow = Omit<EvaluationCaseChange, "candidateValue" | "baselineValue"> & {
  regressed: string | number;
  improved: string | number;
  new_failure: string | number;
  removed: string | number;
};

/** Compare lean case/metric tuples in ClickHouse; only 100 inspection rows cross the wire. */
export async function queryCaseChanges(
  client: ClickHouseClient,
  projectId: string,
  candidateRunId: string,
  baselineRunId: string,
  options: { signal?: AbortSignal } = {},
): Promise<
  Pick<EvaluationRunComparison, "caseChanges" | "caseChangeCounts" | "caseChangesTruncated">
> {
  const result = await client.query({
    ...readCancellation(options.signal),
    // Preserve the existing reader's duplicate-key rule: last in timestamp DESC, id ASC order.
    // Tuple wrapping retains nullable values in argMax and anyIf.
    query: `WITH per_run AS (
              SELECT run_id, ifNull(case_id, '') AS case_key, metric_name,
                     argMax(tuple(outcome, numeric_value, categorical_value, trace_id, case_id),
                            tuple(-toUnixTimestamp64Milli(timestamp), id)) AS value
              FROM evaluation_results FINAL
              WHERE project_id = {projectId:UUID}
                AND run_id IN ({candidateRunId:String}, {baselineRunId:String})
              GROUP BY run_id, case_key, metric_name
            ), paired AS (
              SELECT case_key, metric_name,
                     countIf(run_id = {candidateRunId:String}) > 0 AS has_candidate,
                     countIf(run_id = {baselineRunId:String}) > 0 AS has_baseline,
                     anyIf(value, run_id = {candidateRunId:String}) AS candidate,
                     anyIf(value, run_id = {baselineRunId:String}) AS baseline
              FROM per_run GROUP BY case_key, metric_name
            ), changes AS (
              SELECT *, multiIf(
                NOT has_candidate, 'removed',
                NOT has_baseline AND candidate.1 IN ('fail', 'invalid'), 'new_failure',
                has_baseline AND candidate.1 IN ('fail', 'invalid') AND baseline.1 NOT IN ('fail', 'invalid'), 'regressed',
                has_baseline AND candidate.1 NOT IN ('fail', 'invalid') AND baseline.1 IN ('fail', 'invalid'), 'improved',
                '') AS classification
              FROM paired
            )
            SELECT ifNull(if(has_candidate, candidate.5, baseline.5), 'unspecified') AS caseId,
                   metric_name AS metricName, classification,
                   if(has_candidate, candidate.1, NULL) AS candidateOutcome,
                   if(has_baseline, baseline.1, NULL) AS baselineOutcome,
                   if(has_candidate, candidate.2, NULL) AS candidateNumericValue,
                   if(has_candidate, candidate.3, NULL) AS candidateCategoricalValue,
                   if(has_baseline, baseline.2, NULL) AS baselineNumericValue,
                   if(has_baseline, baseline.3, NULL) AS baselineCategoricalValue,
                   if(has_candidate, candidate.4, NULL) AS candidateTraceId,
                   if(has_baseline, baseline.4, NULL) AS baselineTraceId,
                   countIf(classification = 'regressed') OVER () AS regressed,
                   countIf(classification = 'improved') OVER () AS improved,
                   countIf(classification = 'new_failure') OVER () AS new_failure,
                   countIf(classification = 'removed') OVER () AS removed
            FROM changes WHERE classification != ''
            ORDER BY multiIf(classification = 'regressed', 0, classification = 'new_failure', 1,
                             classification = 'improved', 2, 3), caseId, metricName
            LIMIT 100`,
    query_params: { projectId, candidateRunId, baselineRunId },
    format: "JSONEachRow",
  });
  const rows = await result.json<
    CaseChangeRow & {
      candidateNumericValue: number | null;
      candidateCategoricalValue: string | null;
      baselineNumericValue: number | null;
      baselineCategoricalValue: string | null;
    }
  >();
  const caseChangeCounts = {
    regressed: Number(rows[0]?.regressed ?? 0),
    improved: Number(rows[0]?.improved ?? 0),
    new_failure: Number(rows[0]?.new_failure ?? 0),
    removed: Number(rows[0]?.removed ?? 0),
  };
  const caseChanges = rows.map((row): EvaluationCaseChange => ({
    caseId: row.caseId,
    metricName: row.metricName,
    classification: row.classification,
    candidateOutcome: row.candidateOutcome,
    baselineOutcome: row.baselineOutcome,
    candidateValue: row.candidateNumericValue ?? row.candidateCategoricalValue,
    baselineValue: row.baselineNumericValue ?? row.baselineCategoricalValue,
    candidateTraceId: row.candidateTraceId,
    baselineTraceId: row.baselineTraceId,
  }));
  return {
    caseChanges,
    caseChangeCounts,
    caseChangesTruncated:
      Object.values(caseChangeCounts).reduce((sum, count) => sum + count, 0) > rows.length,
  };
}
