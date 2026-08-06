import type { ClickHouseClient } from "@clickhouse/client";
import type {
  JsonValue,
  Metrics,
  MetricsBucket,
  MetricsRangePreset,
  MetricsSummary,
  NormalizedSpan,
  ObservationKind,
  Page,
  SessionDetail,
  SessionFacets,
  SessionFilters,
  SessionSortField,
  SessionSummary,
  SessionTurnPayload,
  SpanDetail,
  SpanStatus,
  TraceDetail,
  TraceFacets,
  TraceFacetValue,
  TraceFilters,
  TraceSortField,
  TraceSummary,
  UserFilters,
  UserSortField,
  UserSummary,
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
  environment: string;
  release: string | null;
  service_version: string | null;
  model: string | null;
  input_tokens: string | number;
  cached_input_tokens: string | number;
  output_tokens: string | number;
  total_tokens: string | number;
  input_cost: string | number | null;
  output_cost: string | number | null;
  total_cost: string | number | null;
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
  environment: string;
  release: string | null;
  version: string | null;
  service_version: string | null;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  input_cost: number | string | null;
  output_cost: number | string | null;
  total_cost: number | string | null;
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
  input_cost: number | string | null;
  output_cost: number | string | null;
  total_cost: number | string | null;
  session_status: "success" | "error";
  services: string[];
  environments: string[];
  models: string[];
  tags: string[];
  last_seen_at: string;
};

type SessionConversationRow = {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  observation_kind: ObservationKind;
  start_time: string;
  input: string | null;
  output: string | null;
};

type UserSummaryRow = {
  project_id: string;
  user_id: string;
  first_seen_at: string;
  last_seen_at: string;
  trace_count: number | string;
  session_count: number | string;
  error_count: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  input_cost: number | string | null;
  output_cost: number | string | null;
  total_cost: number | string | null;
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
      environment: span.environment,
      release: span.release,
      service_version: span.serviceVersion,
      model: span.model,
      input_tokens: span.inputTokens,
      cached_input_tokens: span.cachedInputTokens ?? 0,
      output_tokens: span.outputTokens,
      total_tokens: span.totalTokens || span.inputTokens + span.outputTokens,
      input_cost: span.inputCost,
      output_cost: span.outputCost,
      total_cost: span.totalCost,
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
  const costSpans = spans.filter(
    (span) => span.observation_kind === "generation" || span.observation_kind === "embedding",
  );
  const inputCost = sumNullable(costSpans.map((span) => span.input_cost));
  const outputCost = sumNullable(costSpans.map((span) => span.output_cost));
  const totalCost = sumNullable(costSpans.map((span) => span.total_cost));
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
        environment: root.environment || "default",
        release: root.release ?? firstDefined(spans.map((span) => span.release)),
        version: root.version ?? firstDefined(spans.map((span) => span.version)),
        service_version:
          root.service_version ?? firstDefined(spans.map((span) => span.service_version)),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: totalCost,
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
  options: TraceFilters & {
    page?: number;
    pageSize?: number;
    sort?: TraceSortField;
    order?: "asc" | "desc";
    sessionIdExact?: string;
  },
): Promise<Page<TraceSummary>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const sort = options.sort ?? "startedAt";
  const order = options.order ?? "desc";
  const { filters, params } = traceWhere(projectId, options);
  const sortExpression = traceSortColumns[sort];
  const offset = (page - 1) * pageSize;
  const [result, countResult] = await Promise.all([
    client.query({
      query: `SELECT * FROM trace_summaries FINAL
              WHERE ${filters.join(" AND ")}
              ORDER BY isNull(${sortExpression}) ASC, ${sortExpression} ${order.toUpperCase()}, started_at DESC, trace_id DESC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM trace_summaries FINAL
              WHERE ${filters.join(" AND ")}`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await result.json<SummaryRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map(summaryFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

type TraceFacet =
  | "status"
  | "service"
  | "name"
  | "model"
  | "environment"
  | "release"
  | "version"
  | "serviceVersion"
  | "tag";

const traceFacetColumns: Record<Exclude<TraceFacet, "tag">, string> = {
  status: "status",
  service: "service_name",
  name: "name",
  model: "model",
  environment: "environment",
  release: "release",
  version: "version",
  serviceVersion: "service_version",
};

const traceSortColumns: Record<TraceSortField, string> = {
  startedAt: "started_at",
  endedAt: "ended_at",
  name: "name",
  traceId: "trace_id",
  serviceName: "service_name",
  status: "status",
  durationMs: "duration_ms",
  spanCount: "span_count",
  generationCount: "generation_count",
  toolCount: "tool_count",
  userId: "user_id",
  sessionId: "session_id",
  model: "model",
  environment: "environment",
  release: "release",
  version: "version",
  serviceVersion: "service_version",
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  totalTokens: "total_tokens",
  inputCost: "input_cost",
  outputCost: "output_cost",
  totalCost: "total_cost",
};

export async function listTraceFacets(
  client: ClickHouseClient,
  projectId: string,
  options: TraceFilters,
): Promise<TraceFacets> {
  const facets = Object.keys({ ...traceFacetColumns, tag: "tags" }) as TraceFacet[];
  const values = await Promise.all(
    facets.map(async (facet) => {
      const { filters, params } = traceWhere(projectId, options, facet);
      const result = await client.query({
        query:
          facet === "tag"
            ? `SELECT tag AS value, count() AS count
               FROM (SELECT tags FROM trace_summaries FINAL WHERE ${filters.join(" AND ")})
               ARRAY JOIN tags AS tag
               WHERE tag != ''
               GROUP BY tag ORDER BY count DESC, value ASC LIMIT 50`
            : `SELECT toString(${traceFacetColumns[facet]}) AS value, count() AS count
               FROM trace_summaries FINAL
               WHERE ${filters.join(" AND ")} AND ifNull(toString(${traceFacetColumns[facet]}), '') != ''
               GROUP BY ${traceFacetColumns[facet]} ORDER BY count DESC, value ASC LIMIT 50`,
        query_params: params,
        format: "JSONEachRow",
      });
      const rows = await result.json<{ value: string; count: number | string }>();
      return [
        facet,
        rows.map((row): TraceFacetValue => ({ value: row.value, count: numeric(row.count) })),
      ] as const;
    }),
  );
  return Object.fromEntries(values) as TraceFacets;
}

function traceWhere(
  projectId: string,
  options: TraceFilters & { sessionIdExact?: string },
  omit?: TraceFacet,
): { filters: string[]; params: Record<string, string | number | string[]> } {
  const filters = ["project_id = {projectId:UUID}"];
  const params: Record<string, string | number | string[]> = { projectId };
  if (options.from !== undefined) {
    filters.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    filters.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  for (const [field, column, facet] of [
    ["statuses", "status", "status"],
    ["services", "service_name", "service"],
    ["names", "name", "name"],
    ["models", "model", "model"],
    ["environments", "environment", "environment"],
    ["releases", "release", "release"],
    ["versions", "version", "version"],
    ["serviceVersions", "service_version", "serviceVersion"],
  ] as const) {
    const value = options[field];
    if (value !== undefined && value.length > 0 && omit !== facet) {
      filters.push(`${column} IN {${field}:Array(String)}`);
      params[field] = value;
    }
  }
  if (options.tags !== undefined && options.tags.length > 0 && omit !== "tag") {
    filters.push("hasAny(tags, {tags:Array(String)})");
    params.tags = options.tags;
  }
  for (const [field, column] of [
    ["userId", "user_id"],
    ["sessionId", "session_id"],
    ["traceId", "trace_id"],
  ] as const) {
    const value = options[field];
    if (value !== undefined) {
      filters.push(
        `positionCaseInsensitive(ifNull(toString(${column}), ''), {${field}:String}) > 0`,
      );
      params[field] = value;
    }
  }
  if (options.exactUserId !== undefined) {
    filters.push("user_id = {exactUserId:String}");
    params.exactUserId = options.exactUserId;
  }
  if (options.sessionIdExact !== undefined) {
    filters.push("session_id = {sessionIdExact:String}");
    params.sessionIdExact = options.sessionIdExact;
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(name, {search:String}) > 0 OR positionCaseInsensitive(trace_id, {search:String}) > 0)",
    );
    params.search = options.search;
  }
  for (const [field, column, operator] of [
    ["minDurationMs", "duration_ms", ">="],
    ["maxDurationMs", "duration_ms", "<="],
    ["minTotalTokens", "total_tokens", ">="],
    ["maxTotalTokens", "total_tokens", "<="],
    ["minTotalCost", "total_cost", ">="],
    ["maxTotalCost", "total_cost", "<="],
  ] as const) {
    const value = options[field];
    if (value !== undefined) {
      filters.push(`${column} ${operator} {${field}:Float64}`);
      params[field] = value;
    }
  }
  return { filters, params };
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
  options: SessionFilters & {
    page?: number;
    pageSize?: number;
    sort?: SessionSortField;
    order?: "asc" | "desc";
  },
): Promise<Page<SessionSummary>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const sort = options.sort ?? "startedAt";
  const order = options.order ?? "desc";
  const offset = (page - 1) * pageSize;
  const { aggregateFilters, filters, params } = sessionWhere(projectId, options);
  const aggregate = sessionAggregateSql(aggregateFilters);
  const sortExpression = sessionSortColumns[sort];
  const [result, countResult] = await Promise.all([
    client.query({
      query: `SELECT * FROM (${aggregate}) AS sessions
              WHERE ${filters.join(" AND ")}
              ORDER BY isNull(${sortExpression}) ASC, ${sortExpression} ${order.toUpperCase()}, session_started_at DESC, session_id ASC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM (${aggregate}) AS sessions
              WHERE ${filters.join(" AND ")}`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await result.json<SessionSummaryRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map(sessionSummaryFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

type SessionFacet = "status" | "user" | "service" | "model" | "environment" | "tag";

export async function listSessionFacets(
  client: ClickHouseClient,
  projectId: string,
  options: SessionFilters,
): Promise<SessionFacets> {
  const facets: SessionFacet[] = ["status", "user", "service", "model", "environment", "tag"];
  const values = await Promise.all(
    facets.map(async (facet) => {
      const { aggregateFilters, filters, params } = sessionWhere(projectId, options, facet);
      const aggregate = sessionAggregateSql(aggregateFilters);
      const arrayColumn = sessionFacetArrayColumns[facet];
      const result = await client.query({
        query:
          arrayColumn === undefined
            ? `SELECT toString(${facet === "user" ? "user_id" : "session_status"}) AS value, count() AS count
               FROM (${aggregate}) AS sessions
               WHERE ${filters.join(" AND ")} AND value != ''
               GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`
            : `SELECT value, count() AS count
               FROM (${aggregate}) AS sessions
               ARRAY JOIN ${arrayColumn} AS value
               WHERE ${filters.join(" AND ")} AND value != ''
               GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`,
        query_params: params,
        format: "JSONEachRow",
      });
      const rows = await result.json<{ value: string; count: number | string }>();
      return [facet, rows.map((row) => ({ value: row.value, count: numeric(row.count) }))] as const;
    }),
  );
  return Object.fromEntries(values) as SessionFacets;
}

const sessionSortColumns: Record<SessionSortField, string> = {
  startedAt: "session_started_at",
  endedAt: "session_ended_at",
  sessionId: "session_id",
  userId: "user_id",
  status: "session_status",
  durationMs: "duration_ms",
  traceCount: "trace_count",
  errorCount: "error_count",
  spanCount: "span_count",
  totalTokens: "total_tokens",
  totalCost: "total_cost",
  lastSeenAt: "last_seen_at",
};

const sessionFacetArrayColumns: Partial<Record<SessionFacet, string>> = {
  service: "services",
  model: "models",
  environment: "environments",
  tag: "tags",
};

function sessionAggregateSql(filters: string[]): string {
  return `SELECT
            project_id,
            assumeNotNull(session_id) AS session_id,
            argMax(user_id, started_at) AS user_id,
            min(started_at) AS session_started_at,
            max(ended_at) AS session_ended_at,
            dateDiff('millisecond', min(started_at), max(ended_at)) AS duration_ms,
            count() AS trace_count,
            countIf(status = 'error') AS error_count,
            if(countIf(status = 'error') > 0, 'error', 'success') AS session_status,
            sum(span_count) AS span_count,
            sum(input_tokens) AS input_tokens,
            sum(output_tokens) AS output_tokens,
            sum(total_tokens) AS total_tokens,
            sumOrNull(input_cost) AS input_cost,
            sumOrNull(output_cost) AS output_cost,
            sumOrNull(total_cost) AS total_cost,
            arraySort(arrayFilter(value -> value != '', groupUniqArray(service_name))) AS services,
            arraySort(arrayFilter(value -> value != '', groupUniqArray(environment))) AS environments,
            arraySort(arrayFilter(value -> value != '', groupUniqArray(ifNull(model, '')))) AS models,
            arraySort(arrayDistinct(arrayFlatten(groupArray(tags)))) AS tags,
            max(last_seen_at) AS last_seen_at
          FROM trace_summaries FINAL
          WHERE ${filters.join(" AND ")}
          GROUP BY project_id, session_id`;
}

function sessionWhere(
  projectId: string,
  options: SessionFilters,
  omit?: SessionFacet,
): {
  aggregateFilters: string[];
  filters: string[];
  params: Record<string, string | number | string[]>;
} {
  const aggregateFilters = [
    "project_id = {projectId:UUID}",
    "session_id IS NOT NULL",
    "session_id != ''",
  ];
  const filters = ["1"];
  const params: Record<string, string | number | string[]> = { projectId };
  if (options.from !== undefined) {
    aggregateFilters.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    aggregateFilters.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  for (const [field, column, facet] of [
    ["statuses", "session_status", "status"],
    ["users", "user_id", "user"],
  ] as const) {
    const value = options[field];
    if (value !== undefined && value.length > 0 && omit !== facet) {
      filters.push(`${column} IN {${field}:Array(String)}`);
      params[field] = value;
    }
  }
  for (const [field, column, facet] of [
    ["services", "services", "service"],
    ["models", "models", "model"],
    ["environments", "environments", "environment"],
    ["tags", "tags", "tag"],
  ] as const) {
    const value = options[field];
    if (value !== undefined && value.length > 0 && omit !== facet) {
      filters.push(`hasAny(${column}, {${field}:Array(String)})`);
      params[field] = value;
    }
  }
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(session_id, {search:String}) > 0 OR positionCaseInsensitive(ifNull(user_id, ''), {search:String}) > 0)",
    );
    params.search = options.search;
  }
  for (const [field, column, operator] of [
    ["minDurationMs", "duration_ms", ">="],
    ["maxDurationMs", "duration_ms", "<="],
    ["minTotalTokens", "total_tokens", ">="],
    ["maxTotalTokens", "total_tokens", "<="],
    ["minTotalCost", "total_cost", ">="],
    ["maxTotalCost", "total_cost", "<="],
  ] as const) {
    const value = options[field];
    if (value !== undefined) {
      filters.push(`${column} ${operator} {${field}:Float64}`);
      params[field] = value;
    }
  }
  return { aggregateFilters, filters, params };
}

export async function getSession(
  client: ClickHouseClient,
  projectId: string,
  sessionId: string,
): Promise<SessionDetail | undefined> {
  const traces = await listTraces(client, projectId, { sessionIdExact: sessionId, pageSize: 100 });
  if (traces.items.length === 0) return undefined;
  const startedAt = traces.items.reduce(
    (minimum, trace) => (trace.startedAt < minimum ? trace.startedAt : minimum),
    traces.items[0]?.startedAt ?? "",
  );
  const endedAt = traces.items.reduce(
    (maximum, trace) => (trace.endedAt > maximum ? trace.endedAt : maximum),
    traces.items[0]?.endedAt ?? "",
  );
  const conversationRows = await readSessionConversationRows(
    client,
    projectId,
    traces.items.map((trace) => trace.traceId),
  );
  const rowsByTrace = new Map<string, SessionConversationRow[]>();
  for (const row of conversationRows) {
    rowsByTrace.set(row.trace_id, [...(rowsByTrace.get(row.trace_id) ?? []), row]);
  }
  const errorCount = traces.items.filter((trace) => trace.status === "error").length;
  return {
    summary: {
      projectId,
      sessionId,
      userId: traces.items.find((trace) => trace.userId !== null)?.userId ?? null,
      startedAt,
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
      traceCount: traces.items.length,
      errorCount,
      spanCount: traces.items.reduce((total, trace) => total + trace.spanCount, 0),
      inputTokens: traces.items.reduce((total, trace) => total + trace.inputTokens, 0),
      outputTokens: traces.items.reduce((total, trace) => total + trace.outputTokens, 0),
      totalTokens: traces.items.reduce((total, trace) => total + trace.totalTokens, 0),
      inputCost: sumNullable(traces.items.map((trace) => trace.inputCost)),
      outputCost: sumNullable(traces.items.map((trace) => trace.outputCost)),
      totalCost: sumNullable(traces.items.map((trace) => trace.totalCost)),
      status: errorCount > 0 ? "error" : "success",
      services: uniqueStrings(traces.items.map((trace) => trace.serviceName)),
      environments: uniqueStrings(traces.items.map((trace) => trace.environment)),
      models: uniqueStrings(traces.items.map((trace) => trace.model)),
      tags: uniqueStrings(traces.items.flatMap((trace) => trace.tags)),
      lastSeenAt: traces.items.reduce(
        (latest, trace) => (trace.lastSeenAt > latest ? trace.lastSeenAt : latest),
        traces.items[0]?.lastSeenAt ?? "",
      ),
    },
    traces: traces.items,
    turns: [...traces.items]
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .map((trace) => sessionTurn(trace, rowsByTrace.get(trace.traceId) ?? []))
      .filter((turn) => turn.prompt !== null || turn.response !== null),
  };
}

const userSortColumns: Record<UserSortField, string> = {
  userId: "user_id",
  firstSeenAt: "first_seen_at",
  lastSeenAt: "last_seen_at",
  traceCount: "trace_count",
  sessionCount: "session_count",
  errorCount: "error_count",
  errorRate: "error_rate",
  totalTokens: "total_tokens",
  totalCost: "total_cost",
};

export async function listUsers(
  client: ClickHouseClient,
  projectId: string,
  options: UserFilters & {
    page?: number;
    pageSize?: number;
    sort?: UserSortField;
    order?: "asc" | "desc";
  },
): Promise<Page<UserSummary>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const sort = options.sort ?? "lastSeenAt";
  const order = options.order ?? "desc";
  const offset = (page - 1) * pageSize;
  const { query, params } = userAggregateSql(projectId, options, true);
  const sortExpression = userSortColumns[sort];
  const [result, countResult] = await Promise.all([
    client.query({
      query: `SELECT *, if(trace_count = 0, 0, error_count / trace_count) AS error_rate
              FROM (${query}) AS users
              ORDER BY isNull(${sortExpression}) ASC, ${sortExpression} ${order.toUpperCase()}, user_id ASC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM (${query}) AS users`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await result.json<UserSummaryRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map(userSummaryFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function getUser(
  client: ClickHouseClient,
  projectId: string,
  userId: string,
  options: Omit<UserFilters, "search" | "exactUserId"> = {},
): Promise<UserSummary | undefined> {
  const { query, params } = userAggregateSql(projectId, { ...options, exactUserId: userId }, false);
  const result = await client.query({
    query: `${query} LIMIT 1`,
    query_params: params,
    format: "JSONEachRow",
  });
  const rows = await result.json<UserSummaryRow>();
  return rows[0] === undefined ? undefined : userSummaryFromRow(rows[0]);
}

function userAggregateSql(
  projectId: string,
  options: UserFilters,
  requireActivity: boolean,
): { query: string; params: Record<string, string> } {
  const filters = ["project_id = {projectId:UUID}", "user_id IS NOT NULL", "user_id != ''"];
  const activity = ["1"];
  const params: Record<string, string> = { projectId };
  if (options.search !== undefined) {
    filters.push("positionCaseInsensitive(ifNull(user_id, ''), {search:String}) > 0");
    params.search = options.search;
  }
  if (options.exactUserId !== undefined) {
    filters.push("user_id = {exactUserId:String}");
    params.exactUserId = options.exactUserId;
  }
  if (options.from !== undefined) {
    activity.push("started_at >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    activity.push("started_at <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  const inRange = activity.join(" AND ");
  return {
    query: `SELECT
              project_id,
              assumeNotNull(user_id) AS user_id,
              min(started_at) AS first_seen_at,
              max(ended_at) AS last_seen_at,
              countIf(${inRange}) AS trace_count,
              uniqExactIf(ifNull(session_id, ''), (${inRange}) AND session_id IS NOT NULL AND session_id != '') AS session_count,
              countIf((${inRange}) AND status = 'error') AS error_count,
              sumIf(input_tokens, ${inRange}) AS input_tokens,
              sumIf(output_tokens, ${inRange}) AS output_tokens,
              sumIf(total_tokens, ${inRange}) AS total_tokens,
              sumOrNull(if(${inRange}, input_cost, NULL)) AS input_cost,
              sumOrNull(if(${inRange}, output_cost, NULL)) AS output_cost,
              sumOrNull(if(${inRange}, total_cost, NULL)) AS total_cost
            FROM trace_summaries FINAL
            WHERE ${filters.join(" AND ")}
            GROUP BY project_id, user_id${requireActivity ? "\n            HAVING trace_count > 0" : ""}`,
    params,
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

function sumNullable(values: Array<number | string | null>): number | null {
  const present = values.map(nullableNumeric).filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
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

async function readSessionConversationRows(
  client: ClickHouseClient,
  projectId: string,
  traceIds: string[],
): Promise<SessionConversationRow[]> {
  if (traceIds.length === 0) return [];
  const result = await client.query({
    query: `SELECT trace_id, span_id, parent_span_id, name, observation_kind, start_time, input, output
            FROM spans FINAL
            WHERE project_id = {projectId:UUID} AND trace_id IN {traceIds:Array(String)}
              AND (input IS NOT NULL OR output IS NOT NULL)
            ORDER BY trace_id ASC, start_time ASC, span_id ASC`,
    query_params: { projectId, traceIds },
    format: "JSONEachRow",
  });
  return result.json<SessionConversationRow>();
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
    environment: row.environment || "default",
    release: row.release,
    serviceVersion: row.service_version,
    model: row.model,
    inputTokens: numeric(row.input_tokens),
    cachedInputTokens: numeric(row.cached_input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
    input: parseNullableJson(row.input),
    output: parseNullableJson(row.output),
    ingestedAt: ensureIso(row.ingested_at),
  };
}

function sessionTurn(
  trace: TraceSummary,
  rows: SessionConversationRow[],
): SessionDetail["turns"][number] {
  const promptRow =
    rows.find((row) => row.parent_span_id.length === 0 && row.input !== null) ??
    rows.find((row) => row.input !== null);
  const responseRow =
    rows.find((row) => row.parent_span_id.length === 0 && row.output !== null) ??
    [...rows]
      .reverse()
      .find(
        (row) =>
          row.output !== null &&
          row.observation_kind !== "tool" &&
          row.observation_kind !== "event",
      ) ??
    [...rows].reverse().find((row) => row.output !== null);
  return {
    trace,
    prompt: conversationPayload(promptRow, "input"),
    response: conversationPayload(responseRow, "output"),
  };
}

function conversationPayload(
  row: SessionConversationRow | undefined,
  field: "input" | "output",
): SessionTurnPayload | null {
  if (row === undefined) return null;
  const value = parseNullableJson(row[field]);
  if (value === null) return null;
  return {
    spanId: row.span_id,
    spanName: row.name,
    observationKind: row.observation_kind,
    value,
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
    environment: row.environment || "default",
    release: row.release,
    version: row.version,
    serviceVersion: row.service_version,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
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
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
    status: row.session_status,
    services: row.services,
    environments: row.environments,
    models: row.models,
    tags: row.tags,
    lastSeenAt: ensureIso(row.last_seen_at),
  };
}

function userSummaryFromRow(row: UserSummaryRow): UserSummary {
  const traceCount = numeric(row.trace_count);
  const errorCount = numeric(row.error_count);
  return {
    projectId: row.project_id,
    userId: row.user_id,
    firstSeenAt: ensureIso(row.first_seen_at),
    lastSeenAt: ensureIso(row.last_seen_at),
    traceCount,
    sessionCount: numeric(row.session_count),
    errorCount,
    errorRate: traceCount === 0 ? 0 : errorCount / traceCount,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
  };
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => value !== null && value !== "")),
  ).sort();
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
