import type { ClickHouseClient } from "@clickhouse/client";
import type {
  EvaluationFacets,
  EvaluationFilters,
  EvaluationOverview,
  EvaluationResult,
  EvaluationSortField,
  MetricsBucket,
  MetricsRangePreset,
  Page,
} from "@lens/contracts";

type EvaluationRow = {
  project_id: string;
  id: string;
  run_id: string | null;
  timestamp: string;
  trace_id: string | null;
  observation_id: string | null;
  response_id: string | null;
  suite_name: string;
  case_id: string | null;
  metric_name: string;
  outcome: EvaluationResult["outcome"];
  data_type: EvaluationResult["dataType"];
  numeric_value: number | string | null;
  categorical_value: string | null;
  explanation: string | null;
  config_id: string | null;
  service_name: string;
  environment: string;
  release: string | null;
  metadata: string;
  expires_at: string;
  ingested_at: string;
  ingest_version: number | string;
};

export async function insertEvaluations(
  client: ClickHouseClient,
  evaluations: EvaluationResult[],
): Promise<void> {
  if (evaluations.length === 0) return;
  await client.insert({
    table: "evaluation_results",
    format: "JSONEachRow",
    values: evaluations.map((result) => ({
      project_id: result.projectId,
      id: result.id,
      run_id: result.runId,
      timestamp: clickHouseTime(result.timestamp),
      trace_id: result.traceId,
      observation_id: result.observationId,
      response_id: result.responseId,
      suite_name: result.suiteName,
      case_id: result.caseId,
      metric_name: result.metricName,
      outcome: result.outcome,
      data_type: result.dataType,
      numeric_value: result.numericValue,
      categorical_value: result.categoricalValue,
      explanation: result.explanation,
      config_id: result.configId,
      service_name: result.serviceName,
      environment: result.environment,
      release: result.release,
      metadata: JSON.stringify(result.metadata),
      expires_at:
        result.expiresAt === null ? "2299-12-31 23:59:59.999" : clickHouseTime(result.expiresAt),
      ingested_at: clickHouseTime(result.ingestedAt),
      ingest_version: result.ingestVersion,
    })),
  });
}

export async function listEvaluations(
  client: ClickHouseClient,
  projectId: string,
  options: EvaluationFilters & {
    page?: number;
    pageSize?: number;
    sort?: EvaluationSortField;
    order?: "asc" | "desc";
  },
): Promise<Page<EvaluationResult>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const sort = options.sort ?? "timestamp";
  const order = options.order ?? "desc";
  const offset = (page - 1) * pageSize;
  const where = evaluationWhere(projectId, options);
  const sortColumn = evaluationSortColumns[sort];
  const [rowsResult, countResult] = await Promise.all([
    client.query({
      query: `SELECT * FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}
              ORDER BY isNull(${sortColumn}) ASC, ${sortColumn} ${order.toUpperCase()}, timestamp DESC, id ASC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...where.params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await rowsResult.json<EvaluationRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numberValue(counts[0]?.total);
  return {
    items: rows.map(evaluationFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function listEvaluationsForTrace(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<EvaluationResult[]> {
  return (await listEvaluations(client, projectId, { traceId, pageSize: 100 })).items;
}

export async function listEvaluationFacets(
  client: ClickHouseClient,
  projectId: string,
  options: EvaluationFilters,
): Promise<EvaluationFacets> {
  const facets = ["suite", "metric", "outcome", "environment", "release"] as const;
  const values = await Promise.all(
    facets.map(async (facet) => {
      const where = evaluationWhere(projectId, options, facet);
      const column = evaluationFacetColumns[facet];
      const result = await client.query({
        query: `SELECT toString(${column}) AS value, count() AS count
                FROM evaluation_results FINAL
                WHERE ${where.filters.join(" AND ")} AND value != ''
                GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`,
        query_params: where.params,
        format: "JSONEachRow",
      });
      const rows = await result.json<{ value: string; count: number | string }>();
      return [
        facet,
        rows.map((row) => ({ value: row.value, count: numberValue(row.count) })),
      ] as const;
    }),
  );
  return Object.fromEntries(values) as EvaluationFacets;
}

export async function queryEvaluationOverview(
  client: ClickHouseClient,
  projectId: string,
  preset: MetricsRangePreset,
  now = new Date(),
  filters: Omit<EvaluationFilters, "from" | "to"> = {},
): Promise<EvaluationOverview> {
  const range = evaluationRange(preset, now);
  const where = evaluationWhere(projectId, { ...filters, from: range.from, to: range.to });
  const interval =
    range.bucket === "hour"
      ? "INTERVAL 1 HOUR"
      : range.bucket === "6hours"
        ? "INTERVAL 6 HOUR"
        : "INTERVAL 1 DAY";
  const [summaryResult, seriesResult, metricsResult, suitesResult] = await Promise.all([
    client.query({
      query: `SELECT count() AS results,
                     countIf(outcome = 'pass') AS passed,
                     countIf(outcome = 'fail') AS failed,
                     countIf(outcome = 'invalid') AS invalid,
                     countIf(outcome = 'unknown') AS unknown,
                     uniqExactIf(ifNull(trace_id, ''), trace_id IS NOT NULL) AS evaluated_traces
              FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT toStartOfInterval(timestamp, ${interval}) AS timestamp,
                     count() AS results,
                     countIf(outcome = 'pass') AS passed,
                     countIf(outcome = 'fail') AS failed,
                     countIf(outcome = 'invalid') AS invalid,
                     countIf(outcome = 'unknown') AS unknown
              FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}
              GROUP BY timestamp ORDER BY timestamp ASC`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT metric_name, count() AS results,
                     countIf(outcome = 'pass') AS passed,
                     countIf(outcome = 'fail') AS failed,
                     countIf(outcome = 'invalid') AS invalid,
                     countIf(outcome = 'unknown') AS unknown,
                     avgOrNull(numeric_value) AS average_numeric_value
              FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}
              GROUP BY metric_name ORDER BY results DESC, metric_name ASC LIMIT 50`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT suite_name, count() AS results,
                     countIf(outcome = 'pass') AS passed,
                     countIf(outcome = 'fail') AS failed,
                     countIf(outcome = 'invalid') AS invalid,
                     countIf(outcome = 'unknown') AS unknown
              FROM evaluation_results FINAL
              WHERE ${where.filters.join(" AND ")}
              GROUP BY suite_name ORDER BY results DESC, suite_name ASC LIMIT 50`,
      query_params: where.params,
      format: "JSONEachRow",
    }),
  ]);
  const summaries = await summaryResult.json<Record<string, number | string>>();
  const summary = outcomeCounts(summaries[0] ?? {});
  const seriesRows = await seriesResult.json<Array<Record<string, number | string>>[number]>();
  const metricRows =
    await metricsResult.json<Array<Record<string, number | string | null>>[number]>();
  const suiteRows = await suitesResult.json<Array<Record<string, number | string>>[number]>();
  return {
    range: { preset, bucket: range.bucket, from: range.from, to: range.to },
    summary: {
      ...summary,
      passRate: passRate(summary.passed, summary.failed),
      evaluatedTraces: numberValue(summaries[0]?.evaluated_traces),
    },
    series: seriesRows.map((row) => {
      const counts = outcomeCounts(row);
      return {
        timestamp: isoTime(String(row.timestamp ?? "")),
        ...counts,
        passRate: passRate(counts.passed, counts.failed),
      };
    }),
    metrics: metricRows.map((row) => {
      const counts = outcomeCounts(row);
      return {
        metricName: String(row.metric_name ?? ""),
        ...counts,
        passRate: passRate(counts.passed, counts.failed),
        averageNumericValue: nullableNumber(row.average_numeric_value),
      };
    }),
    suites: suiteRows.map((row) => {
      const counts = outcomeCounts(row);
      return {
        suiteName: String(row.suite_name ?? ""),
        ...counts,
        passRate: passRate(counts.passed, counts.failed),
      };
    }),
  };
}

const evaluationSortColumns: Record<EvaluationSortField, string> = {
  timestamp: "timestamp",
  suiteName: "suite_name",
  caseId: "case_id",
  metricName: "metric_name",
  outcome: "outcome",
  numericValue: "numeric_value",
  environment: "environment",
  release: "release",
};

const evaluationFacetColumns = {
  suite: "suite_name",
  metric: "metric_name",
  outcome: "outcome",
  environment: "environment",
  release: "release",
} as const;

function evaluationWhere(
  projectId: string,
  options: EvaluationFilters,
  omit?: keyof EvaluationFacets,
): { filters: string[]; params: Record<string, string | string[]> } {
  const filters = ["project_id = {projectId:UUID}"];
  const params: Record<string, string | string[]> = { projectId };
  if (options.from !== undefined) {
    filters.push("timestamp >= {from:DateTime64(3)}");
    params.from = clickHouseTime(options.from);
  }
  if (options.to !== undefined) {
    filters.push("timestamp <= {to:DateTime64(3)}");
    params.to = clickHouseTime(options.to);
  }
  for (const [field, column, facet] of [
    ["suites", "suite_name", "suite"],
    ["metrics", "metric_name", "metric"],
    ["outcomes", "outcome", "outcome"],
    ["environments", "environment", "environment"],
    ["releases", "release", "release"],
    ["runIds", "run_id", undefined],
  ] as const) {
    const values = options[field];
    if (values !== undefined && values.length > 0 && (facet === undefined || omit !== facet)) {
      filters.push(`${column} IN {${field}:Array(String)}`);
      params[field] = values;
    }
  }
  if (options.traceId !== undefined) {
    filters.push("trace_id = {traceId:String}");
    params.traceId = options.traceId;
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(ifNull(case_id, ''), {search:String}) > 0 OR positionCaseInsensitive(ifNull(trace_id, ''), {search:String}) > 0 OR positionCaseInsensitive(ifNull(explanation, ''), {search:String}) > 0)",
    );
    params.search = options.search;
  }
  return { filters, params };
}

function evaluationFromRow(row: EvaluationRow): EvaluationResult {
  return {
    projectId: row.project_id,
    id: row.id,
    runId: row.run_id,
    timestamp: isoTime(row.timestamp),
    traceId: row.trace_id,
    observationId: row.observation_id,
    responseId: row.response_id,
    suiteName: row.suite_name,
    caseId: row.case_id,
    metricName: row.metric_name,
    outcome: row.outcome,
    dataType: row.data_type,
    numericValue: nullableNumber(row.numeric_value),
    categoricalValue: row.categorical_value,
    explanation: row.explanation,
    configId: row.config_id,
    serviceName: row.service_name,
    environment: row.environment,
    release: row.release,
    metadata: parseMetadata(row.metadata),
    expiresAt: isoTime(row.expires_at),
    ingestedAt: isoTime(row.ingested_at),
    ingestVersion: String(row.ingest_version),
  };
}

function outcomeCounts(row: Record<string, number | string | null | undefined>) {
  return {
    results: numberValue(row.results),
    passed: numberValue(row.passed),
    failed: numberValue(row.failed),
    invalid: numberValue(row.invalid),
    unknown: numberValue(row.unknown),
  };
}

function evaluationRange(
  preset: MetricsRangePreset,
  now: Date,
): { from: string; to: string; bucket: MetricsBucket } {
  const duration =
    preset === "24h" ? 86_400_000 : preset === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
  return {
    from: new Date(now.getTime() - duration).toISOString(),
    to: now.toISOString(),
    bucket: preset === "24h" ? "hour" : preset === "7d" ? "6hours" : "day",
  };
}

function passRate(passed: number, failed: number): number {
  const total = passed + failed;
  return total === 0 ? 0 : passed / total;
}

function numberValue(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function parseMetadata(value: string): EvaluationResult["metadata"] {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as EvaluationResult["metadata"])
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
