import type { ClickHouseClient } from "@clickhouse/client";
import type { Metrics, MetricsBucket, MetricsRangePreset, MetricsSummary } from "@lens/contracts";
import { type SummaryRow, summaryFromRow } from "./trace-summary.js";
import { clickHouseDateTimeParam, ensureIso, nullableNumeric, numeric } from "./values.js";

export async function queryMetrics(
  client: ClickHouseClient,
  projectId: string,
  preset: MetricsRangePreset,
  now = new Date(),
): Promise<Metrics> {
  const range = resolveMetricsRange(preset, now);
  const queryParams = {
    projectId,
    from: clickHouseDateTimeParam(range.from),
    to: clickHouseDateTimeParam(range.to),
    previousFrom: clickHouseDateTimeParam(range.previousFrom),
  };
  const interval = metricsIntervalSql(range.bucket);
  const [
    traceTotals,
    generationTotals,
    traceSeries,
    generationSeries,
    models,
    services,
    top,
    errors,
  ] = await Promise.all([
    queryMetricRows(
      client,
      `SELECT
          if(started_at >= {from:DateTime64(3)}, 'current', 'previous') AS period,
          count() AS traces,
          sum(span_count) AS spans,
          countIf(status = 'error') AS errors,
          sum(input_tokens) AS input_tokens,
          sum(output_tokens) AS output_tokens,
          sum(total_tokens) AS total_tokens,
          sum(ifNull(total_cost, 0)) AS total_cost,
          uniqExactIf(ifNull(user_id, ''), user_id IS NOT NULL AND user_id != '') AS active_users,
          uniqExactIf(ifNull(session_id, ''), session_id IS NOT NULL AND session_id != '') AS active_sessions
        FROM trace_summaries FINAL
        WHERE project_id = {projectId:UUID}
          AND started_at >= {previousFrom:DateTime64(3)} AND started_at <= {to:DateTime64(3)}
        GROUP BY period`,
      queryParams,
    ),
    queryMetricRows(
      client,
      `SELECT
          if(start_time >= {from:DateTime64(3)}, 'current', 'previous') AS period,
          count() AS generations,
          countIf(status = 'error') AS errors,
          quantileExact(0.5)(duration_nano / 1000000) AS p50,
          quantileExact(0.95)(duration_nano / 1000000) AS p95,
          uniqExactIf(ifNull(model, ''), model IS NOT NULL AND model != '') AS active_models
        FROM spans FINAL
        WHERE project_id = {projectId:UUID} AND observation_kind = 'generation'
          AND start_time >= {previousFrom:DateTime64(3)} AND start_time <= {to:DateTime64(3)}
        GROUP BY period`,
      queryParams,
    ),
    queryMetricRows(
      client,
      `SELECT
          toStartOfInterval(started_at, ${interval}) AS timestamp,
          count() AS traces,
          countIf(status = 'error') AS errors,
          sum(generation_count) AS generations,
          sum(input_tokens) AS input_tokens,
          sum(output_tokens) AS output_tokens
        FROM trace_summaries FINAL
        WHERE project_id = {projectId:UUID}
          AND started_at >= {from:DateTime64(3)} AND started_at <= {to:DateTime64(3)}
        GROUP BY timestamp ORDER BY timestamp ASC`,
      queryParams,
    ),
    queryMetricRows(
      client,
      `SELECT
          toStartOfInterval(start_time, ${interval}) AS timestamp,
          quantileExact(0.5)(duration_nano / 1000000) AS p50,
          quantileExact(0.95)(duration_nano / 1000000) AS p95
        FROM spans FINAL
        WHERE project_id = {projectId:UUID} AND observation_kind = 'generation'
          AND start_time >= {from:DateTime64(3)} AND start_time <= {to:DateTime64(3)}
        GROUP BY timestamp ORDER BY timestamp ASC`,
      queryParams,
    ),
    queryMetricRows(
      client,
      `SELECT
          model,
          count() AS generations,
          countIf(status = 'error') AS errors,
          sum(input_tokens) AS input_tokens,
          sum(output_tokens) AS output_tokens,
          sum(total_tokens) AS total_tokens,
          quantileExact(0.95)(duration_nano / 1000000) AS p95
        FROM spans FINAL
        WHERE project_id = {projectId:UUID} AND observation_kind = 'generation'
          AND start_time >= {from:DateTime64(3)} AND start_time <= {to:DateTime64(3)}
        GROUP BY model ORDER BY total_tokens DESC LIMIT 10`,
      queryParams,
    ),
    queryMetricRows(
      client,
      `SELECT
          service_name,
          count() AS traces,
          sum(generation_count) AS generations,
          countIf(status = 'error') AS errors,
          sum(total_tokens) AS total_tokens,
          quantileExact(0.95)(duration_ms) AS p95
        FROM trace_summaries FINAL
        WHERE project_id = {projectId:UUID}
          AND started_at >= {from:DateTime64(3)} AND started_at <= {to:DateTime64(3)}
        GROUP BY service_name ORDER BY total_tokens DESC LIMIT 10`,
      queryParams,
    ),
    querySummaryRows(
      client,
      `SELECT * FROM trace_summaries FINAL
        WHERE project_id = {projectId:UUID}
          AND started_at >= {from:DateTime64(3)} AND started_at <= {to:DateTime64(3)}
        ORDER BY total_tokens DESC, started_at DESC LIMIT 5`,
      queryParams,
    ),
    querySummaryRows(
      client,
      `SELECT * FROM trace_summaries FINAL
        WHERE project_id = {projectId:UUID} AND status = 'error'
          AND started_at >= {from:DateTime64(3)} AND started_at <= {to:DateTime64(3)}
        ORDER BY started_at DESC LIMIT 5`,
      queryParams,
    ),
  ]);

  const currentTrace = traceTotals.find((row) => row.period === "current");
  const previousTrace = traceTotals.find((row) => row.period === "previous");
  const currentGeneration = generationTotals.find((row) => row.period === "current");
  const previousGeneration = generationTotals.find((row) => row.period === "previous");
  const current = metricsSummary(currentTrace, currentGeneration);
  const previous = metricsSummary(previousTrace, previousGeneration);
  const latencyByTimestamp = new Map(
    generationSeries.map((row) => [metricTimestamp(row.timestamp), row]),
  );
  const points = traceSeries.map((row) => {
    const timestamp = metricTimestamp(row.timestamp);
    const latency = latencyByTimestamp.get(timestamp);
    return {
      timestamp,
      traces: numeric(row.traces),
      traceErrors: numeric(row.errors),
      generations: numeric(row.generations),
      inputTokens: numeric(row.input_tokens),
      outputTokens: numeric(row.output_tokens),
      generationDurationP50Ms: nullableNumeric(latency?.p50),
      generationDurationP95Ms: nullableNumeric(latency?.p95),
    };
  });
  const totalModelTokens = models.reduce((sum, row) => sum + numeric(row.total_tokens), 0);
  const { bucketMs: _bucketMs, ...publicRange } = range;

  return {
    range: publicRange,
    current,
    previous,
    series: fillMetricSeries(points, range),
    models: models.map((row) => {
      const generations = numeric(row.generations);
      const modelErrors = numeric(row.errors);
      const totalTokens = numeric(row.total_tokens);
      return {
        model: typeof row.model === "string" && row.model.length > 0 ? row.model : null,
        generations,
        errors: modelErrors,
        errorRate: generations === 0 ? 0 : modelErrors / generations,
        inputTokens: numeric(row.input_tokens),
        outputTokens: numeric(row.output_tokens),
        totalTokens,
        tokenShare: totalModelTokens === 0 ? 0 : totalTokens / totalModelTokens,
        tokensPerGeneration: generations === 0 ? 0 : totalTokens / generations,
        durationP95Ms: numeric(row.p95),
      };
    }),
    services: services.map((row) => {
      const traces = numeric(row.traces);
      const serviceErrors = numeric(row.errors);
      return {
        serviceName: String(row.service_name ?? "unknown-service"),
        traces,
        generations: numeric(row.generations),
        errors: serviceErrors,
        errorRate: traces === 0 ? 0 : serviceErrors / traces,
        totalTokens: numeric(row.total_tokens),
        durationP95Ms: numeric(row.p95),
      };
    }),
    topTokenTraces: top.map(summaryFromRow),
    recentErrors: errors.map(summaryFromRow),
  };
}

type MetricRow = Record<string, number | string | null>;

async function queryMetricRows(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
): Promise<MetricRow[]> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return result.json<MetricRow>();
}

async function querySummaryRows(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
): Promise<SummaryRow[]> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return result.json<SummaryRow>();
}

function metricsSummary(
  trace: MetricRow | undefined,
  generation: MetricRow | undefined,
): MetricsSummary {
  const traces = numeric(trace?.traces);
  const errors = numeric(trace?.errors);
  const generations = numeric(generation?.generations);
  const totalTokens = numeric(trace?.total_tokens);
  return {
    traces,
    spans: numeric(trace?.spans),
    generations,
    errors,
    errorRate: traces === 0 ? 0 : errors / traces,
    inputTokens: numeric(trace?.input_tokens),
    outputTokens: numeric(trace?.output_tokens),
    totalTokens,
    totalCost: numeric(trace?.total_cost),
    tokensPerGeneration: generations === 0 ? 0 : totalTokens / generations,
    generationDurationP50Ms: numeric(generation?.p50),
    generationDurationP95Ms: numeric(generation?.p95),
    activeModels: numeric(generation?.active_models),
    activeUsers: numeric(trace?.active_users),
    activeSessions: numeric(trace?.active_sessions),
  };
}

type ResolvedMetricsRange = Metrics["range"] & { bucketMs: number };

function resolveMetricsRange(preset: MetricsRangePreset, now: Date): ResolvedMetricsRange {
  const durationMs = preset === "24h" ? 86_400_000 : preset === "7d" ? 604_800_000 : 2_592_000_000;
  const bucket: MetricsBucket = preset === "24h" ? "hour" : preset === "7d" ? "6hours" : "day";
  const bucketMs = bucket === "hour" ? 3_600_000 : bucket === "6hours" ? 21_600_000 : 86_400_000;
  const toMs = now.getTime();
  const fromMs = toMs - durationMs;
  return {
    preset,
    bucket,
    bucketMs,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    previousFrom: new Date(fromMs - durationMs).toISOString(),
    previousTo: new Date(fromMs).toISOString(),
  };
}

function metricsIntervalSql(bucket: MetricsBucket): string {
  return bucket === "hour"
    ? "INTERVAL 1 HOUR"
    : bucket === "6hours"
      ? "INTERVAL 6 HOUR"
      : "INTERVAL 1 DAY";
}

function fillMetricSeries(
  points: Metrics["series"],
  range: ResolvedMetricsRange,
): Metrics["series"] {
  const byTimestamp = new Map(points.map((point) => [point.timestamp, point]));
  const first = Math.floor(Date.parse(range.from) / range.bucketMs) * range.bucketMs;
  const last = Math.floor(Date.parse(range.to) / range.bucketMs) * range.bucketMs;
  const filled: Metrics["series"] = [];
  for (let timestamp = first; timestamp <= last; timestamp += range.bucketMs) {
    const iso = new Date(timestamp).toISOString();
    filled.push(
      byTimestamp.get(iso) ?? {
        timestamp: iso,
        traces: 0,
        traceErrors: 0,
        generations: 0,
        inputTokens: 0,
        outputTokens: 0,
        generationDurationP50Ms: null,
        generationDurationP95Ms: null,
      },
    );
  }
  return filled;
}

function metricTimestamp(value: unknown): string {
  const date = new Date(ensureIso(String(value ?? "")));
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value ?? "");
}
