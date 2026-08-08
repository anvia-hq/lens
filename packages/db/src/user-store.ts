import type { ClickHouseClient } from "@clickhouse/client";
import type { Page, UserFilters, UserSortField, UserSummary } from "@lens/contracts";
import { clickHouseDateTimeParam, ensureIso, nullableNumeric, numeric } from "./values.js";

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
