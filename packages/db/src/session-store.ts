import type { ClickHouseClient } from "@clickhouse/client";
import {
  encodeCursor,
  type JsonValue,
  type ObservationKind,
  type Page,
  type SessionDetail,
  type SessionFacets,
  type SessionFilters,
  type SessionSortField,
  type SessionStatus,
  type SessionSummary,
  type SessionTurnPayload,
  type TraceSummary,
} from "@lens/contracts";
import { type SummaryRow, summaryFromRow } from "./trace-summary.js";
import { clickHouseDateTimeParam, ensureIso, nullableNumeric, numeric } from "./values.js";

type SessionSummaryRow = {
  project_id: string;
  session_id: string;
  user_id: string | null;
  session_started_at: string;
  session_ended_at: string;
  duration_ms: number | string;
  trace_count: number | string;
  failed_trace_count: number | string;
  span_error_count: number | string;
  span_count: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  input_cost: number | string | null;
  output_cost: number | string | null;
  total_cost: number | string | null;
  session_status: SessionStatus;
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

type SessionFacet = "status" | "user" | "service" | "model" | "environment" | "tag";

const sessionSortColumns: Record<SessionSortField, string> = {
  startedAt: "session_started_at",
  endedAt: "session_ended_at",
  sessionId: "session_id",
  userId: "user_id",
  status: "session_status",
  durationMs: "duration_ms",
  traceCount: "trace_count",
  errorCount: "failed_trace_count",
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

export async function getSession(
  client: ClickHouseClient,
  projectId: string,
  sessionId: string,
  options: {
    pageSize?: 25 | 50 | 100;
    cursor?: { startedAt: string; traceId: string };
  } = {},
): Promise<SessionDetail | undefined> {
  const pageSize = options.pageSize ?? 100;
  const pageFilters = ["project_id = {projectId:UUID}", "session_id = {sessionId:String}"];
  const params: Record<string, string | number> = {
    projectId,
    sessionId,
    limit: pageSize + 1,
  };
  if (options.cursor !== undefined) {
    pageFilters.push(
      "(started_at > {cursorStartedAt:DateTime64(3)} OR (started_at = {cursorStartedAt:DateTime64(3)} AND trace_id > {cursorTraceId:String}))",
    );
    params.cursorStartedAt = clickHouseDateTimeParam(options.cursor.startedAt);
    params.cursorTraceId = options.cursor.traceId;
  }
  const aggregate = sessionAggregateSql([
    "project_id = {projectId:UUID}",
    "session_id = {sessionId:String}",
  ]);
  const [summaryResult, traceResult] = await Promise.all([
    client.query({
      query: `SELECT * FROM (${aggregate}) AS sessions LIMIT 1`,
      query_params: { projectId, sessionId },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT * FROM trace_summaries FINAL
              WHERE ${pageFilters.join(" AND ")}
              ORDER BY started_at ASC, trace_id ASC
              LIMIT {limit:UInt16}`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const summaryRows = await summaryResult.json<SessionSummaryRow>();
  const summaryRow = summaryRows[0];
  if (summaryRow === undefined) return undefined;
  const traceRows = await traceResult.json<SummaryRow>();
  const hasMore = traceRows.length > pageSize;
  const traces = traceRows.slice(0, pageSize).map(summaryFromRow);
  const conversationRows = await readSessionConversationRows(
    client,
    projectId,
    traces.map((trace) => trace.traceId),
  );
  const rowsByTrace = new Map<string, SessionConversationRow[]>();
  for (const row of conversationRows) {
    rowsByTrace.set(row.trace_id, [...(rowsByTrace.get(row.trace_id) ?? []), row]);
  }
  const lastTrace = traces.at(-1);
  return {
    summary: sessionSummaryFromRow(summaryRow),
    traces,
    turns: traces
      .map((trace) => sessionTurn(trace, rowsByTrace.get(trace.traceId) ?? []))
      .filter((turn) => turn.prompt !== null || turn.response !== null),
    nextCursor:
      hasMore && lastTrace !== undefined
        ? encodeCursor(lastTrace.startedAt, lastTrace.traceId)
        : null,
  };
}

function sessionAggregateSql(filters: string[]): string {
  return `SELECT
            project_id,
            assumeNotNull(session_id) AS session_id,
            argMax(user_id, started_at) AS user_id,
            min(started_at) AS session_started_at,
            max(ended_at) AS session_ended_at,
            dateDiff('millisecond', min(started_at), max(ended_at)) AS duration_ms,
            count() AS trace_count,
            countIf(status = 'error') AS failed_trace_count,
            sum(error_count) AS span_error_count,
            multiIf(
              countIf(status = 'error') > 0, 'error',
              countIf(status = 'running') > 0, 'running',
              'success'
            ) AS session_status,
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

function sessionSummaryFromRow(row: SessionSummaryRow): SessionSummary {
  return {
    projectId: row.project_id,
    sessionId: row.session_id,
    userId: row.user_id,
    startedAt: ensureIso(row.session_started_at),
    endedAt: ensureIso(row.session_ended_at),
    durationMs: numeric(row.duration_ms),
    traceCount: numeric(row.trace_count),
    errorCount: numeric(row.failed_trace_count),
    spanErrorCount: numeric(row.span_error_count),
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

function parseNullableJson(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}
