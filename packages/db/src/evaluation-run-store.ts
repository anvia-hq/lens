import type { ClickHouseClient } from "@clickhouse/client";
import type {
  EvaluationCaseChange,
  EvaluationMetricBreakdown,
  EvaluationMetricComparison,
  EvaluationResult,
  EvaluationRun,
  EvaluationRunComparison,
  EvaluationRunDetail,
  EvaluationRunFacets,
  EvaluationRunFilters,
  EvaluationRunSortField,
  EvaluationRunSummary,
  Page,
} from "@lens/contracts";
import { listEvaluations } from "./evaluation-store.js";

type RunRow = {
  project_id: string;
  id: string;
  status: EvaluationRun["status"];
  suite_name: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | string | null;
  case_count: number | string;
  metric_names: string[];
  passed: number | string | null;
  failed: number | string | null;
  invalid: number | string | null;
  service_name: string;
  environment: string;
  release: string | null;
  dataset_name: string | null;
  dataset_version: string | null;
  metadata: string;
  expires_at: string;
  ingested_at: string;
  ingest_version: number | string;
  state_version: 1 | 2;
};

type AggregateRow = {
  run_id: string;
  results: number | string;
  passed: number | string;
  failed: number | string;
  invalid: number | string;
  unknown: number | string;
  evaluated_cases: number | string;
  evaluated_traces: number | string;
};

type OperationalRow = {
  run_id: string;
  expected_traces: number | string;
  found_traces: number | string;
  p95_latency_ms: number | string | null;
  average_total_tokens: number | string | null;
};

type RunSummaryRow = RunRow & {
  results: number | string;
  actual_passed: number | string;
  actual_failed: number | string;
  actual_invalid: number | string;
  actual_unknown: number | string;
  evaluated_cases: number | string;
  evaluated_traces: number | string;
  pass_rate: number | string;
  expected_traces: number | string;
  found_traces: number | string;
  p95_latency_ms: number | string | null;
  average_total_tokens: number | string | null;
  trace_coverage: number | string;
};

export async function insertEvaluationRuns(
  client: ClickHouseClient,
  runs: EvaluationRun[],
): Promise<void> {
  if (runs.length === 0) return;
  await client.insert({
    table: "evaluation_runs",
    format: "JSONEachRow",
    values: runs.map((run) => ({
      project_id: run.projectId,
      id: run.id,
      status: run.status,
      suite_name: run.suiteName,
      started_at: clickHouseTime(run.startedAt),
      completed_at: run.completedAt === null ? null : clickHouseTime(run.completedAt),
      duration_ms: run.durationMs,
      case_count: run.caseCount,
      metric_names: run.metricNames,
      passed: run.passed,
      failed: run.failed,
      invalid: run.invalid,
      service_name: run.serviceName,
      environment: run.environment,
      release: run.release,
      dataset_name: run.datasetName,
      dataset_version: run.datasetVersion,
      metadata: JSON.stringify(run.metadata),
      expires_at:
        run.expiresAt === null ? "2299-12-31 23:59:59.999" : clickHouseTime(run.expiresAt),
      ingested_at: clickHouseTime(run.ingestedAt),
      ingest_version: run.ingestVersion,
      state_version: run.stateVersion,
    })),
  });
}

export async function listEvaluationRuns(
  client: ClickHouseClient,
  projectId: string,
  options: EvaluationRunFilters & {
    page?: number;
    pageSize?: number;
    sort?: EvaluationRunSortField;
    order?: "asc" | "desc";
  },
): Promise<Page<EvaluationRunSummary>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 25) ? (options.pageSize ?? 25) : 25;
  const offset = (page - 1) * pageSize;
  const where = runWhere(projectId, options);
  const sortColumn = evaluationRunSortColumns[options.sort ?? "startedAt"];
  const order = options.order ?? "desc";
  const [rowsResult, countResult] = await Promise.all([
    client.query({
      query: `WITH filtered_runs AS
                (SELECT * FROM evaluation_runs FINAL WHERE ${where.filters.join(" AND ")}),
              aggregates AS
                (SELECT run_id, count() AS results,
                        countIf(outcome = 'pass') AS actual_passed,
                        countIf(outcome = 'fail') AS actual_failed,
                        countIf(outcome = 'invalid') AS actual_invalid,
                        countIf(outcome = 'unknown') AS actual_unknown,
                        uniqExactIf(ifNull(case_id, ''), case_id IS NOT NULL) AS evaluated_cases,
                        uniqExactIf(ifNull(trace_id, ''), trace_id IS NOT NULL) AS evaluated_traces
                 FROM evaluation_results FINAL
                 WHERE project_id = {projectId:UUID}
                   AND run_id IN (SELECT id FROM filtered_runs)
                 GROUP BY run_id),
              trace_ids AS
                (SELECT run_id, trace_id FROM evaluation_results FINAL
                 WHERE project_id = {projectId:UUID}
                   AND run_id IN (SELECT id FROM filtered_runs) AND trace_id IS NOT NULL
                 GROUP BY run_id, trace_id),
              operational AS
                (SELECT trace_ids.run_id,
                        count() AS expected_traces,
                        countIf(summaries.trace_id IS NOT NULL) AS found_traces,
                        quantileExactIf(0.95)(summaries.duration_ms, summaries.trace_id IS NOT NULL) AS p95_latency_ms,
                        avgIf(summaries.total_tokens, summaries.trace_id IS NOT NULL) AS average_total_tokens
                 FROM trace_ids
                 LEFT JOIN
                   (SELECT project_id, trace_id, duration_ms, total_tokens FROM trace_summaries FINAL) AS summaries
                 ON summaries.project_id = {projectId:UUID} AND summaries.trace_id = trace_ids.trace_id
                 GROUP BY trace_ids.run_id)
              SELECT filtered_runs.*,
                     ifNull(aggregates.results, 0) AS results,
                     ifNull(aggregates.actual_passed, 0) AS actual_passed,
                     ifNull(aggregates.actual_failed, 0) AS actual_failed,
                     ifNull(aggregates.actual_invalid, 0) AS actual_invalid,
                     ifNull(aggregates.actual_unknown, 0) AS actual_unknown,
                     ifNull(aggregates.evaluated_cases, 0) AS evaluated_cases,
                     ifNull(aggregates.evaluated_traces, 0) AS evaluated_traces,
                     if(actual_passed + actual_failed = 0, 0,
                        actual_passed / (actual_passed + actual_failed)) AS pass_rate,
                     ifNull(operational.expected_traces, 0) AS expected_traces,
                     ifNull(operational.found_traces, 0) AS found_traces,
                     operational.p95_latency_ms AS p95_latency_ms,
                     operational.average_total_tokens AS average_total_tokens,
                     if(expected_traces = 0, 0, found_traces / expected_traces) AS trace_coverage
              FROM filtered_runs
              LEFT JOIN aggregates ON aggregates.run_id = filtered_runs.id
              LEFT JOIN operational ON operational.run_id = filtered_runs.id
              ORDER BY isNull(${sortColumn}) ASC, ${sortColumn} ${order.toUpperCase()}, started_at DESC, id ASC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...where.params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM evaluation_runs FINAL
              WHERE ${where.filters.join(" AND ")}`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await rowsResult.json<RunSummaryRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map(runSummaryFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function listEvaluationRunFacets(
  client: ClickHouseClient,
  projectId: string,
  options: EvaluationRunFilters,
): Promise<EvaluationRunFacets> {
  const facets = ["suite", "status", "environment", "release"] as const;
  const values = await Promise.all(
    facets.map(async (facet) => {
      const where = runWhere(projectId, options, facet);
      const column = evaluationRunFacetColumns[facet];
      const result = await client.query({
        query: `SELECT toString(${column}) AS value, count() AS count
                FROM evaluation_runs FINAL
                WHERE ${where.filters.join(" AND ")} AND value != ''
                GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`,
        query_params: where.params,
        format: "JSONEachRow",
      });
      const rows = await result.json<{ value: string; count: number | string }>();
      return [facet, rows.map((row) => ({ value: row.value, count: numeric(row.count) }))] as const;
    }),
  );
  return Object.fromEntries(values) as EvaluationRunFacets;
}

export async function getEvaluationRun(
  client: ClickHouseClient,
  projectId: string,
  runId: string,
): Promise<EvaluationRunSummary | undefined> {
  const result = await client.query({
    query: `SELECT * FROM evaluation_runs FINAL
            WHERE project_id = {projectId:UUID} AND id = {runId:String} LIMIT 1`,
    query_params: { projectId, runId },
    format: "JSONEachRow",
  });
  const rows = await result.json<RunRow>();
  const run = rows[0];
  if (run === undefined) return undefined;
  return (await hydrateRunSummaries(client, projectId, [runFromRow(run)]))[0];
}

export async function getEvaluationRunDetail(
  client: ClickHouseClient,
  projectId: string,
  runId: string,
): Promise<EvaluationRunDetail | undefined> {
  const run = await getEvaluationRun(client, projectId, runId);
  if (run === undefined) return undefined;
  const [metrics, results] = await Promise.all([
    queryRunMetrics(client, projectId, runId),
    listRunResults(client, projectId, runId),
  ]);
  return { run, metrics, results };
}

export async function compareEvaluationRuns(
  client: ClickHouseClient,
  projectId: string,
  candidateRunId: string,
  baselineRunId: string,
): Promise<Omit<EvaluationRunComparison, "gate"> | undefined> {
  const [candidate, baseline] = await Promise.all([
    getEvaluationRun(client, projectId, candidateRunId),
    getEvaluationRun(client, projectId, baselineRunId),
  ]);
  if (candidate === undefined || baseline === undefined) return undefined;
  const [candidateMetrics, baselineMetrics, candidateResults, baselineResults] = await Promise.all([
    queryRunMetrics(client, projectId, candidateRunId),
    queryRunMetrics(client, projectId, baselineRunId),
    listRunResults(client, projectId, candidateRunId),
    listRunResults(client, projectId, baselineRunId),
  ]);
  const metrics = compareMetrics(candidateMetrics, baselineMetrics);
  const caseChanges = compareCases(candidateResults, baselineResults);
  const warnings: string[] = [];
  if (candidate.datasetName !== baseline.datasetName) warnings.push("Runs use different datasets");
  if (candidate.datasetVersion !== baseline.datasetVersion) {
    warnings.push("Runs use different dataset versions");
  }
  if (candidate.traceCoverage < 1 || baseline.traceCoverage < 1) {
    warnings.push("Operational metrics have incomplete trace coverage");
  }
  return {
    candidate,
    baseline,
    passRate: comparisonValue(candidate.passRate, baseline.passRate),
    p95LatencyMs: comparisonValue(candidate.p95LatencyMs, baseline.p95LatencyMs),
    averageTotalTokens: comparisonValue(candidate.averageTotalTokens, baseline.averageTotalTokens),
    metrics,
    caseChanges: caseChanges.slice(0, 100),
    caseChangeCounts: {
      regressed: caseChanges.filter((item) => item.classification === "regressed").length,
      improved: caseChanges.filter((item) => item.classification === "improved").length,
      new_failure: caseChanges.filter((item) => item.classification === "new_failure").length,
      removed: caseChanges.filter((item) => item.classification === "removed").length,
    },
    warnings,
  };
}

async function hydrateRunSummaries(
  client: ClickHouseClient,
  projectId: string,
  runs: EvaluationRun[],
): Promise<EvaluationRunSummary[]> {
  if (runs.length === 0) return [];
  const runIds = runs.map((run) => run.id);
  const [aggregateResult, operationalResult] = await Promise.all([
    client.query({
      query: `SELECT run_id, count() AS results,
                     countIf(outcome = 'pass') AS passed,
                     countIf(outcome = 'fail') AS failed,
                     countIf(outcome = 'invalid') AS invalid,
                     countIf(outcome = 'unknown') AS unknown,
                     uniqExactIf(ifNull(case_id, ''), case_id IS NOT NULL) AS evaluated_cases,
                     uniqExactIf(ifNull(trace_id, ''), trace_id IS NOT NULL) AS evaluated_traces
              FROM evaluation_results FINAL
              WHERE project_id = {projectId:UUID} AND run_id IN {runIds:Array(String)}
              GROUP BY run_id`,
      query_params: { projectId, runIds },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT traces.run_id,
                     count() AS expected_traces,
                     countIf(summaries.trace_id IS NOT NULL) AS found_traces,
                     quantileExactIf(0.95)(summaries.duration_ms, summaries.trace_id IS NOT NULL) AS p95_latency_ms,
                     avgIf(summaries.total_tokens, summaries.trace_id IS NOT NULL) AS average_total_tokens
              FROM
                (SELECT run_id, trace_id FROM evaluation_results FINAL
                 WHERE project_id = {projectId:UUID} AND run_id IN {runIds:Array(String)}
                   AND trace_id IS NOT NULL GROUP BY run_id, trace_id) AS traces
              LEFT JOIN (SELECT project_id, trace_id, duration_ms, total_tokens FROM trace_summaries FINAL) AS summaries
                ON summaries.project_id = {projectId:UUID} AND summaries.trace_id = traces.trace_id
              GROUP BY traces.run_id`,
      query_params: { projectId, runIds },
      format: "JSONEachRow",
    }),
  ]);
  const aggregates = new Map(
    (await aggregateResult.json<AggregateRow>()).map((row) => [row.run_id, row]),
  );
  const operational = new Map(
    (await operationalResult.json<OperationalRow>()).map((row) => [row.run_id, row]),
  );
  return runs.map((run) => {
    const aggregate = aggregates.get(run.id);
    const ops = operational.get(run.id);
    const passed = numeric(aggregate?.passed);
    const failed = numeric(aggregate?.failed);
    const expectedTraces = numeric(ops?.expected_traces);
    const foundTraces = numeric(ops?.found_traces);
    return {
      ...run,
      results: numeric(aggregate?.results),
      actualPassed: passed,
      actualFailed: failed,
      actualInvalid: numeric(aggregate?.invalid),
      actualUnknown: numeric(aggregate?.unknown),
      passRate: passed + failed === 0 ? 0 : passed / (passed + failed),
      evaluatedCases: numeric(aggregate?.evaluated_cases),
      evaluatedTraces: numeric(aggregate?.evaluated_traces),
      p95LatencyMs: nullableNumber(ops?.p95_latency_ms),
      averageTotalTokens: nullableNumber(ops?.average_total_tokens),
      traceCoverage: expectedTraces === 0 ? 0 : foundTraces / expectedTraces,
    };
  });
}

async function queryRunMetrics(
  client: ClickHouseClient,
  projectId: string,
  runId: string,
): Promise<EvaluationMetricBreakdown[]> {
  const result = await client.query({
    query: `SELECT metric_name, count() AS results,
                   countIf(outcome = 'pass') AS passed,
                   countIf(outcome = 'fail') AS failed,
                   countIf(outcome = 'invalid') AS invalid,
                   countIf(outcome = 'unknown') AS unknown,
                   avgOrNull(numeric_value) AS average_numeric_value
            FROM evaluation_results FINAL
            WHERE project_id = {projectId:UUID} AND run_id = {runId:String}
            GROUP BY metric_name ORDER BY metric_name ASC`,
    query_params: { projectId, runId },
    format: "JSONEachRow",
  });
  const rows = await result.json<Record<string, number | string | null>>();
  return rows.map((row) => {
    const passed = numeric(row.passed);
    const failed = numeric(row.failed);
    return {
      metricName: String(row.metric_name ?? ""),
      results: numeric(row.results),
      passed,
      failed,
      invalid: numeric(row.invalid),
      unknown: numeric(row.unknown),
      passRate: passed + failed === 0 ? 0 : passed / (passed + failed),
      averageNumericValue: nullableNumber(row.average_numeric_value),
    };
  });
}

async function listRunResults(
  client: ClickHouseClient,
  projectId: string,
  runId: string,
): Promise<EvaluationResult[]> {
  const page = await listEvaluations(client, projectId, { runIds: [runId], pageSize: 100 });
  if (page.total <= page.items.length) return page.items;
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(page.total / 100) - 1 }, (_, index) =>
      listEvaluations(client, projectId, { runIds: [runId], page: index + 2, pageSize: 100 }),
    ),
  );
  return [...page.items, ...pages.flatMap((item) => item.items)];
}

function compareMetrics(
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

function compareCases(
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

function runWhere(
  projectId: string,
  options: EvaluationRunFilters,
  omit?: keyof EvaluationRunFacets,
): { filters: string[]; params: Record<string, string | string[]> } {
  const filters = ["project_id = {projectId:UUID}"];
  const params: Record<string, string | string[]> = { projectId };
  if (options.from !== undefined) {
    filters.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseTime(options.from);
  }
  if (options.to !== undefined) {
    filters.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseTime(options.to);
  }
  for (const [field, column, facet] of [
    ["suites", "suite_name", "suite"],
    ["statuses", "status", "status"],
    ["environments", "environment", "environment"],
    ["releases", "release", "release"],
  ] as const) {
    const values = options[field];
    if (values !== undefined && values.length > 0 && omit !== facet) {
      filters.push(`${column} IN {${field}:Array(String)}`);
      params[field] = values;
    }
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(id, {search:String}) > 0 OR positionCaseInsensitive(suite_name, {search:String}) > 0 OR positionCaseInsensitive(ifNull(release, ''), {search:String}) > 0)",
    );
    params.search = options.search;
  }
  return { filters, params };
}

const evaluationRunSortColumns: Record<EvaluationRunSortField, string> = {
  startedAt: "started_at",
  suiteName: "suite_name",
  status: "status",
  release: "release",
  environment: "environment",
  evaluatedCases: "evaluated_cases",
  results: "results",
  passRate: "pass_rate",
  durationMs: "duration_ms",
  p95LatencyMs: "p95_latency_ms",
  averageTotalTokens: "average_total_tokens",
  traceCoverage: "trace_coverage",
};

const evaluationRunFacetColumns = {
  suite: "suite_name",
  status: "status",
  environment: "environment",
  release: "release",
} as const;

function runFromRow(row: RunRow): EvaluationRun {
  return {
    projectId: row.project_id,
    id: row.id,
    status: row.status,
    suiteName: row.suite_name,
    startedAt: isoTime(row.started_at),
    completedAt: row.completed_at === null ? null : isoTime(row.completed_at),
    durationMs: nullableNumber(row.duration_ms),
    caseCount: numeric(row.case_count),
    metricNames: row.metric_names,
    passed: nullableNumber(row.passed),
    failed: nullableNumber(row.failed),
    invalid: nullableNumber(row.invalid),
    serviceName: row.service_name,
    environment: row.environment,
    release: row.release,
    datasetName: row.dataset_name,
    datasetVersion: row.dataset_version,
    metadata: parseMetadata(row.metadata),
    expiresAt: isoTime(row.expires_at),
    ingestedAt: isoTime(row.ingested_at),
    ingestVersion: String(row.ingest_version),
    stateVersion: row.state_version,
  };
}

function runSummaryFromRow(row: RunSummaryRow): EvaluationRunSummary {
  return {
    ...runFromRow(row),
    results: numeric(row.results),
    actualPassed: numeric(row.actual_passed),
    actualFailed: numeric(row.actual_failed),
    actualInvalid: numeric(row.actual_invalid),
    actualUnknown: numeric(row.actual_unknown),
    passRate: numeric(row.pass_rate),
    evaluatedCases: numeric(row.evaluated_cases),
    evaluatedTraces: numeric(row.evaluated_traces),
    p95LatencyMs: nullableNumber(row.p95_latency_ms),
    averageTotalTokens: nullableNumber(row.average_total_tokens),
    traceCoverage: numeric(row.trace_coverage),
  };
}

function comparisonValue(candidate: number | null, baseline: number | null) {
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

function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function parseMetadata(value: string): EvaluationRun["metadata"] {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as EvaluationRun["metadata"])
      : {};
  } catch {
    return {};
  }
}

function clickHouseTime(value: string): string {
  return value.replace("T", " ").replace("Z", "");
}

function isoTime(value: string): string {
  const candidate = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
