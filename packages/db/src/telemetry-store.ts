import type { ClickHouseClient } from "@clickhouse/client";
import {
  type CursorPage,
  decodeCursor,
  encodeCursor,
  type JsonValue,
  type Metrics,
  type MetricsBucket,
  type MetricsRangePreset,
  type MetricsSummary,
  type NormalizedSpan,
  type ObservationKind,
  type SessionDetail,
  type SessionSummary,
  type SpanDetail,
  type SpanStatus,
  type TraceDetail,
  type TraceFilters,
  type TraceSummary,
} from "@lens/contracts";

type SpanRow = {
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  trace_state: string;
  name: string;
  kind: number;
  observation_kind: ObservationKind;
  status: SpanStatus;
  status_message: string;
  start_time: string;
  end_time: string;
  duration_nano: string;
  service_name: string;
  scope_name: string;
  scope_version: string;
  resource_attributes: string;
  span_attributes: string;
  events: string;
  links: string;
  trace_name: string | null;
  user_id: string | null;
  session_id: string | null;
  tags: string[];
  version: string | null;
  model: string | null;
  input_tokens: string | number;
  output_tokens: string | number;
  total_tokens: string | number;
  input: string | null;
  output: string | null;
  ingested_at: string;
};

type SummaryRow = {
  project_id: string;
  trace_id: string;
  name: string;
  service_name: string;
  status: SpanStatus;
  started_at: string;
  ended_at: string;
  duration_ms: number | string;
  span_count: number | string;
  generation_count: number | string;
  tool_count: number | string;
  user_id: string | null;
  session_id: string | null;
  tags: string[];
  model: string | null;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  last_seen_at: string;
};

type SessionSummaryRow = {
  project_id: string;
  session_id: string;
  user_id: string | null;
  session_started_at: string;
  session_ended_at: string;
  duration_ms: number | string;
  trace_count: number | string;
  error_count: number | string;
  span_count: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  last_seen_at: string;
};

export async function insertSpans(
  client: ClickHouseClient,
  spans: NormalizedSpan[],
): Promise<void> {
  if (spans.length === 0) return;
  await client.insert({
    table: "spans",
    format: "JSONEachRow",
    values: spans.map((span) => ({
      project_id: span.projectId,
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId ?? "",
      trace_state: span.traceState,
      name: span.name,
      kind: span.kind,
      observation_kind: span.observationKind,
      status: span.status,
      status_message: span.statusMessage,
      start_time: nanoToClickHouse(span.startTimeUnixNano),
      end_time: nanoToClickHouse(span.endTimeUnixNano),
      duration_nano: span.durationNano,
      service_name: span.serviceName,
      scope_name: span.scopeName,
      scope_version: span.scopeVersion,
      resource_attributes: JSON.stringify(span.resourceAttributes),
      span_attributes: JSON.stringify(span.spanAttributes),
      events: JSON.stringify(span.events),
      links: JSON.stringify(span.links),
      trace_name: span.traceName,
      user_id: span.userId,
      session_id: span.sessionId,
      tags: span.tags,
      version: span.version,
      model: span.model,
      input_tokens: span.inputTokens,
      output_tokens: span.outputTokens,
      total_tokens: span.totalTokens || span.inputTokens + span.outputTokens,
      input: span.input === null ? null : JSON.stringify(span.input),
      output: span.output === null ? null : JSON.stringify(span.output),
      expires_at: span.expiresAt?.replace("T", " ").replace("Z", "") ?? "2299-12-31 23:59:59.999",
      ingested_at: span.ingestedAt.replace("T", " ").replace("Z", ""),
      ingest_version: span.ingestVersion,
    })),
  });
}

export async function materializeTrace(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<void> {
  const spans = await readSpanRows(client, projectId, traceId);
  if (spans.length === 0) return;
  const root =
    spans.find((span) => span.parent_span_id.length === 0) ??
    spans.toSorted((left, right) => left.start_time.localeCompare(right.start_time))[0];
  if (root === undefined) return;
  const startedAt = spans.reduce(
    (minimum, span) => (span.start_time < minimum ? span.start_time : minimum),
    root.start_time,
  );
  const endedAt = spans.reduce(
    (maximum, span) => (span.end_time > maximum ? span.end_time : maximum),
    root.end_time,
  );
  const error = spans.some((span) => span.status === "error");
  const inputTokens = spans
    .filter((span) => span.observation_kind === "generation")
    .reduce((sum, span) => sum + numeric(span.input_tokens), 0);
  const outputTokens = spans
    .filter((span) => span.observation_kind === "generation")
    .reduce((sum, span) => sum + numeric(span.output_tokens), 0);
  const maxVersion = spans.reduce((max, span) => Math.max(max, Date.parse(span.ingested_at)), 0);
  const expiresAt = await currentTraceExpiration(client, projectId, traceId);

  await client.insert({
    table: "trace_summaries",
    format: "JSONEachRow",
    values: [
      {
        project_id: projectId,
        trace_id: traceId,
        name: root.trace_name ?? root.name,
        service_name: root.service_name,
        status: error ? "error" : spans.every((span) => span.status === "ok") ? "ok" : "unset",
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: Math.max(
          0,
          Number(BigInt(clickHouseToNano(endedAt)) - BigInt(clickHouseToNano(startedAt))) /
            1_000_000,
        ),
        span_count: spans.length,
        generation_count: spans.filter((span) => span.observation_kind === "generation").length,
        tool_count: spans.filter((span) => span.observation_kind === "tool").length,
        user_id: root.user_id ?? firstDefined(spans.map((span) => span.user_id)),
        session_id: root.session_id ?? firstDefined(spans.map((span) => span.session_id)),
        tags: Array.from(new Set(spans.flatMap((span) => span.tags))),
        model: firstDefined(spans.map((span) => span.model)),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        last_seen_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
        expires_at: expiresAt,
        summary_version: String(BigInt(Math.max(Date.now(), maxVersion)) * 1_000_000n),
      },
    ],
  });
}

async function currentTraceExpiration(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<string> {
  const result = await client.query({
    query: `SELECT max(expires_at) AS expires_at FROM spans FINAL
            WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}`,
    query_params: { projectId, traceId },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ expires_at: string }>();
  return rows[0]?.expires_at ?? "2299-12-31 23:59:59.999";
}

export async function listTraces(
  client: ClickHouseClient,
  projectId: string,
  options: TraceFilters & { cursor?: string; limit?: number },
): Promise<CursorPage<TraceSummary>> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params: Record<string, string | number> = { projectId, limit: limit + 1 };
  const filters = ["project_id = {projectId:UUID}"];
  if (options.from !== undefined) {
    filters.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    filters.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  for (const [field, column] of [
    ["status", "status"],
    ["service", "service_name"],
    ["name", "name"],
    ["model", "model"],
    ["userId", "user_id"],
    ["sessionId", "session_id"],
  ] as const) {
    const value = options[field];
    if (value !== undefined) {
      filters.push(`${column} = {${field}:String}`);
      params[field] = value;
    }
  }
  if (options.tag !== undefined) {
    filters.push("has(tags, {tag:String})");
    params.tag = options.tag;
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(name, {search:String}) > 0 OR trace_id = {search:String})",
    );
    params.search = options.search;
  }
  if (options.cursor !== undefined) {
    const cursor = decodeCursor(options.cursor);
    if (cursor !== undefined) {
      filters.push("(started_at, trace_id) < ({cursorTime:DateTime64(9)}, {cursorId:String})");
      params.cursorTime = clickHouseDateTimeParam(cursor.startedAt);
      params.cursorId = cursor.traceId;
    }
  }
  const result = await client.query({
    query: `SELECT * FROM trace_summaries FINAL
            WHERE ${filters.join(" AND ")}
            ORDER BY started_at DESC, trace_id DESC
            LIMIT {limit:UInt16}`,
    query_params: params,
    format: "JSONEachRow",
  });
  const rows = await result.json<SummaryRow>();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(summaryFromRow);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last !== undefined ? encodeCursor(last.startedAt, last.traceId) : null,
  };
}

export async function getTrace(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<TraceDetail | undefined> {
  const summaryResult = await client.query({
    query: `SELECT * FROM trace_summaries FINAL
            WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
            LIMIT 1`,
    query_params: { projectId, traceId },
    format: "JSONEachRow",
  });
  const summaries = await summaryResult.json<SummaryRow>();
  const summary = summaries[0];
  if (summary === undefined) return undefined;
  const spans = await readSpanRows(client, projectId, traceId);
  return { summary: summaryFromRow(summary), spans: spans.map(spanFromRow) };
}

export async function listSessions(
  client: ClickHouseClient,
  projectId: string,
  options: { from?: string; to?: string; search?: string; limit?: number },
): Promise<SessionSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params: Record<string, string | number> = { projectId, limit };
  const filters = ["project_id = {projectId:UUID}", "session_id IS NOT NULL", "session_id != ''"];
  if (options.from !== undefined) {
    filters.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    filters.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(session_id, {search:String}) > 0 OR positionCaseInsensitive(ifNull(user_id, ''), {search:String}) > 0)",
    );
    params.search = options.search;
  }
  const result = await client.query({
    query: `SELECT
              project_id,
              assumeNotNull(session_id) AS session_id,
              argMax(user_id, started_at) AS user_id,
              min(started_at) AS session_started_at,
              max(ended_at) AS session_ended_at,
              dateDiff('millisecond', min(started_at), max(ended_at)) AS duration_ms,
              count() AS trace_count,
              countIf(status = 'error') AS error_count,
              sum(span_count) AS span_count,
              sum(input_tokens) AS input_tokens,
              sum(output_tokens) AS output_tokens,
              sum(total_tokens) AS total_tokens,
              max(last_seen_at) AS last_seen_at
            FROM trace_summaries FINAL
            WHERE ${filters.join(" AND ")}
            GROUP BY project_id, session_id
            ORDER BY session_started_at DESC, session_id ASC
            LIMIT {limit:UInt16}`,
    query_params: params,
    format: "JSONEachRow",
  });
  return (await result.json<SessionSummaryRow>()).map(sessionSummaryFromRow);
}

export async function getSession(
  client: ClickHouseClient,
  projectId: string,
  sessionId: string,
): Promise<SessionDetail | undefined> {
  const traces = await listTraces(client, projectId, { sessionId, limit: 100 });
  if (traces.items.length === 0) return undefined;
  const startedAt = traces.items.reduce(
    (minimum, trace) => (trace.startedAt < minimum ? trace.startedAt : minimum),
    traces.items[0]?.startedAt ?? "",
  );
  const endedAt = traces.items.reduce(
    (maximum, trace) => (trace.endedAt > maximum ? trace.endedAt : maximum),
    traces.items[0]?.endedAt ?? "",
  );
  return {
    summary: {
      projectId,
      sessionId,
      userId: traces.items.find((trace) => trace.userId !== null)?.userId ?? null,
      startedAt,
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
      traceCount: traces.items.length,
      errorCount: traces.items.filter((trace) => trace.status === "error").length,
      spanCount: traces.items.reduce((total, trace) => total + trace.spanCount, 0),
      inputTokens: traces.items.reduce((total, trace) => total + trace.inputTokens, 0),
      outputTokens: traces.items.reduce((total, trace) => total + trace.outputTokens, 0),
      totalTokens: traces.items.reduce((total, trace) => total + trace.totalTokens, 0),
      lastSeenAt: traces.items.reduce(
        (latest, trace) => (trace.lastSeenAt > latest ? trace.lastSeenAt : latest),
        traces.items[0]?.lastSeenAt ?? "",
      ),
    },
    traces: traces.items,
  };
}

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

function nullableNumeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function reconcileProjectRetention(
  client: ClickHouseClient,
  projectId: string,
  retentionDays: number | null,
): Promise<void> {
  const expression =
    retentionDays === null
      ? "toDateTime64('2299-12-31 23:59:59.999', 3, 'UTC')"
      : `addDays(toDateTime64(start_time, 3), ${Math.max(1, Math.trunc(retentionDays))})`;
  await client.command({
    query: `ALTER TABLE spans UPDATE expires_at = ${expression} WHERE project_id = {projectId:UUID}`,
    query_params: { projectId },
  });
  const summaryExpression =
    retentionDays === null
      ? "toDateTime64('2299-12-31 23:59:59.999', 3, 'UTC')"
      : `addDays(toDateTime64(started_at, 3), ${Math.max(1, Math.trunc(retentionDays))})`;
  await client.command({
    query: `ALTER TABLE trace_summaries UPDATE expires_at = ${summaryExpression} WHERE project_id = {projectId:UUID}`,
    query_params: { projectId },
  });
}

export async function deleteProjectTelemetry(
  client: ClickHouseClient,
  projectId: string,
): Promise<void> {
  await client.command({
    query: "ALTER TABLE spans DELETE WHERE project_id = {projectId:UUID}",
    query_params: { projectId },
  });
  await client.command({
    query: "ALTER TABLE trace_summaries DELETE WHERE project_id = {projectId:UUID}",
    query_params: { projectId },
  });
}

async function readSpanRows(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<SpanRow[]> {
  const result = await client.query({
    query: `SELECT * FROM spans FINAL
            WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
            ORDER BY start_time ASC, span_id ASC`,
    query_params: { projectId, traceId },
    format: "JSONEachRow",
  });
  return result.json<SpanRow>();
}

function spanFromRow(row: SpanRow): SpanDetail {
  return {
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id || null,
    traceState: row.trace_state,
    name: row.name,
    kind: numeric(row.kind),
    observationKind: row.observation_kind,
    status: row.status,
    statusMessage: row.status_message,
    startTimeUnixNano: clickHouseToNano(row.start_time),
    endTimeUnixNano: clickHouseToNano(row.end_time),
    durationNano: String(row.duration_nano),
    serviceName: row.service_name,
    scopeName: row.scope_name,
    scopeVersion: row.scope_version,
    resourceAttributes: parseJsonRecord(row.resource_attributes),
    spanAttributes: parseJsonRecord(row.span_attributes),
    events: parseJsonArray(row.events),
    links: parseJsonArray(row.links),
    traceName: row.trace_name,
    userId: row.user_id,
    sessionId: row.session_id,
    tags: row.tags,
    version: row.version,
    model: row.model,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    input: parseNullableJson(row.input),
    output: parseNullableJson(row.output),
    ingestedAt: ensureIso(row.ingested_at),
  };
}

function summaryFromRow(row: SummaryRow): TraceSummary {
  return {
    projectId: row.project_id,
    traceId: row.trace_id,
    name: row.name,
    serviceName: row.service_name,
    status: row.status,
    startedAt: ensureIso(row.started_at),
    endedAt: ensureIso(row.ended_at),
    durationMs: numeric(row.duration_ms),
    spanCount: numeric(row.span_count),
    generationCount: numeric(row.generation_count),
    toolCount: numeric(row.tool_count),
    userId: row.user_id,
    sessionId: row.session_id,
    tags: row.tags,
    model: row.model,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    lastSeenAt: ensureIso(row.last_seen_at),
  };
}

function sessionSummaryFromRow(row: SessionSummaryRow): SessionSummary {
  return {
    projectId: row.project_id,
    sessionId: row.session_id,
    userId: row.user_id,
    startedAt: ensureIso(row.session_started_at),
    endedAt: ensureIso(row.session_ended_at),
    durationMs: numeric(row.duration_ms),
    traceCount: numeric(row.trace_count),
    errorCount: numeric(row.error_count),
    spanCount: numeric(row.span_count),
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    lastSeenAt: ensureIso(row.last_seen_at),
  };
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstDefined<T>(values: Array<T | null>): T | null {
  return values.find((value): value is T => value !== null) ?? null;
}

function parseNullableJson(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

function parseJsonRecord(value: string): Record<string, JsonValue> {
  const parsed = parseNullableJson(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
}

function parseJsonArray(value: string): JsonValue[] {
  const parsed = parseNullableJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function nanoToClickHouse(value: string): string {
  const nanoseconds = BigInt(value);
  const milliseconds = nanoseconds / 1_000_000n;
  const nanos = (nanoseconds % 1_000_000_000n).toString().padStart(9, "0");
  const base = new Date(Number(milliseconds)).toISOString().slice(0, 19).replace("T", " ");
  return `${base}.${nanos}`;
}

function clickHouseToNano(value: string): string {
  const normalized = value.replace(" ", "T");
  const [whole = normalized, fraction = "0"] = normalized.split(".");
  const seconds = BigInt(Math.floor(Date.parse(`${whole}Z`) / 1_000));
  return (seconds * 1_000_000_000n + BigInt(fraction.padEnd(9, "0").slice(0, 9))).toString();
}

function ensureIso(value: string): string {
  if (value.endsWith("Z")) return value;
  return `${value.replace(" ", "T")}Z`;
}

function clickHouseDateTimeParam(value: string): string {
  const milliseconds = Date.parse(value);
  if (Number.isFinite(milliseconds)) {
    return new Date(milliseconds).toISOString().replace("T", " ").replace("Z", "");
  }
  return value.replace("T", " ").replace(/Z$/, "");
}
