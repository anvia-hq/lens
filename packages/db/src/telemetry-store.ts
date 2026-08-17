import type { ClickHouseClient } from "@clickhouse/client";
import type {
  JsonValue,
  NormalizedSpan,
  ObservationKind,
  Page,
  SpanDetail,
  SpanStatus,
  TraceDetail,
  TraceFacets,
  TraceFacetValue,
  TraceFilters,
  TraceListItem,
  TraceSortField,
} from "@lens/contracts";
import { listEvaluationsForTrace, listHumanReviewOutcomes } from "./evaluation-store.js";
import { type SummaryRow, summaryFromRow } from "./trace-summary.js";
import {
  clickHouseDateTimeParam,
  ensureIso,
  nullableNumeric,
  numeric,
  sumNullable,
} from "./values.js";

export { getSession, listSessionFacets, listSessions } from "./session-store.js";
export { type SummaryRow, summaryFromRow } from "./trace-summary.js";
export { getUser, listUsers } from "./user-store.js";

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
  ingest_version: string | number;
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
  const root = spans.find((span) => span.parent_span_id.length === 0);
  const representative =
    root ?? spans.toSorted((left, right) => left.start_time.localeCompare(right.start_time))[0];
  if (representative === undefined) return;
  const startedAt = spans.reduce(
    (minimum, span) => (span.start_time < minimum ? span.start_time : minimum),
    representative.start_time,
  );
  const endedAt = spans.reduce(
    (maximum, span) => (span.end_time > maximum ? span.end_time : maximum),
    representative.end_time,
  );
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
  const summaryVersion = spans.reduce((maximum, span) => {
    const version = BigInt(span.ingest_version);
    return version > maximum ? version : maximum;
  }, 0n);
  const expiresAt = await currentTraceExpiration(client, projectId, traceId);

  await client.insert({
    table: "trace_summaries",
    format: "JSONEachRow",
    values: [
      {
        project_id: projectId,
        trace_id: traceId,
        name: representative.trace_name ?? representative.name,
        service_name: representative.service_name,
        status: root?.status ?? "running",
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
        error_count: spans.filter((span) => span.status === "error").length,
        user_id: representative.user_id ?? firstDefined(spans.map((span) => span.user_id)),
        session_id: representative.session_id ?? firstDefined(spans.map((span) => span.session_id)),
        tags: Array.from(new Set(spans.flatMap((span) => span.tags))),
        model: firstDefined(spans.map((span) => span.model)),
        environment: representative.environment || "default",
        release: representative.release ?? firstDefined(spans.map((span) => span.release)),
        version: representative.version ?? firstDefined(spans.map((span) => span.version)),
        service_version:
          representative.service_version ?? firstDefined(spans.map((span) => span.service_version)),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: totalCost,
        last_seen_at: new Date().toISOString().replace("T", " ").replace("Z", ""),
        expires_at: expiresAt,
        summary_version: summaryVersion.toString(),
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

export async function getTraceExpiration(
  client: ClickHouseClient,
  projectId: string,
  traceId: string,
): Promise<string> {
  return ensureIso(await currentTraceExpiration(client, projectId, traceId));
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
): Promise<Page<TraceListItem>> {
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
  const reviews = await listHumanReviewOutcomes(
    client,
    projectId,
    rows.map((row) => row.trace_id),
  );
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map((row) => ({
      ...summaryFromRow(row),
      reviewOutcome: reviews.get(row.trace_id) ?? null,
    })),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function listTracesByIds(
  client: ClickHouseClient,
  projectId: string,
  traceIds: string[],
): Promise<TraceListItem[]> {
  if (traceIds.length === 0) return [];
  const result = await client.query({
    query: `SELECT * FROM trace_summaries FINAL
            WHERE project_id = {projectId:UUID} AND trace_id IN {traceIds:Array(String)}`,
    query_params: { projectId, traceIds },
    format: "JSONEachRow",
  });
  const rows = await result.json<SummaryRow>();
  const reviews = await listHumanReviewOutcomes(client, projectId, traceIds);
  const byId = new Map(
    rows.map((row) => [
      row.trace_id,
      { ...summaryFromRow(row), reviewOutcome: reviews.get(row.trace_id) ?? null },
    ]),
  );
  return traceIds.flatMap((traceId) => {
    const trace = byId.get(traceId);
    return trace ? [trace] : [];
  });
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
  if (options.review !== undefined) {
    const reviewed = `SELECT trace_id FROM evaluation_results FINAL
                      WHERE project_id = {projectId:UUID} AND source = 'human'
                        AND metric_name = 'human-review'`;
    if (options.review === "unreviewed") {
      filters.push(`trace_id NOT IN (${reviewed})`);
    } else {
      filters.push(`trace_id IN (${reviewed} AND outcome = {reviewOutcome:String})`);
      params.reviewOutcome = options.review;
    }
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
  const [spans, evaluations] = await Promise.all([
    readSpanRows(client, projectId, traceId),
    listEvaluationsForTrace(client, projectId, traceId),
  ]);
  return { summary: summaryFromRow(summary), spans: spans.map(spanFromRow), evaluations };
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
  const evaluationExpression =
    retentionDays === null
      ? "toDateTime64('2299-12-31 23:59:59.999', 3, 'UTC')"
      : `addDays(toDateTime64(timestamp, 3), ${Math.max(1, Math.trunc(retentionDays))})`;
  await client.command({
    query: `ALTER TABLE evaluation_results UPDATE expires_at = ${evaluationExpression} WHERE project_id = {projectId:UUID}`,
    query_params: { projectId },
  });
  await client.command({
    query: `ALTER TABLE evaluation_runs UPDATE expires_at = ${summaryExpression} WHERE project_id = {projectId:UUID}`,
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
  await client.command({
    query: "ALTER TABLE evaluation_results DELETE WHERE project_id = {projectId:UUID}",
    query_params: { projectId },
  });
  await client.command({
    query: "ALTER TABLE evaluation_runs DELETE WHERE project_id = {projectId:UUID}",
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
