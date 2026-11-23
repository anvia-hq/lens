import type { ClickHouseClient } from "@clickhouse/client";
import type {
  ObservationKind,
  Page,
  RunFacets,
  RunFilters,
  RunListItem,
  RunSortField,
  SpanStatus,
} from "@lens/contracts";
import { extractPayloadPreview } from "./payload-preview.js";
import { clickHouseDateTimeParam, ensureIso, nullableNumeric, numeric } from "./values.js";

type RunListRow = {
  project_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  trace_name: string | null;
  observation_kind: ObservationKind;
  status: SpanStatus;
  status_message: string;
  start_time: string;
  end_time: string;
  duration_nano: string | number;
  service_name: string;
  model: string | null;
  environment: string;
  release: string | null;
  version: string | null;
  service_version: string | null;
  user_id: string | null;
  session_id: string | null;
  tags: string[];
  input_tokens: string | number;
  output_tokens: string | number;
  total_tokens: string | number;
  input_cost: string | number | null;
  output_cost: string | number | null;
  total_cost: string | number | null;
  input_snippet: string | null;
  output_snippet: string | null;
};

type RunFacet =
  | "observationKind"
  | "status"
  | "service"
  | "name"
  | "model"
  | "environment"
  | "release"
  | "version"
  | "serviceVersion"
  | "tag";

const runFacetColumns: Record<Exclude<RunFacet, "tag">, string> = {
  observationKind: "observation_kind",
  status: "status",
  service: "service_name",
  name: "name",
  model: "model",
  environment: "environment",
  release: "release",
  version: "version",
  serviceVersion: "service_version",
};

const runSortColumns: Record<RunSortField, string> = {
  startedAt: "start_time",
  endedAt: "end_time",
  name: "name",
  observationKind: "observation_kind",
  status: "status",
  durationMs: "duration_nano",
  serviceName: "service_name",
  model: "model",
  environment: "environment",
  release: "release",
  version: "version",
  serviceVersion: "service_version",
  userId: "user_id",
  sessionId: "session_id",
  traceId: "trace_id",
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  totalTokens: "total_tokens",
  inputCost: "input_cost",
  outputCost: "output_cost",
  totalCost: "total_cost",
};

export async function listRuns(
  client: ClickHouseClient,
  projectId: string,
  options: RunFilters & {
    page?: number;
    pageSize?: number;
    sort?: RunSortField;
    order?: "asc" | "desc";
  },
): Promise<Page<RunListItem>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const sort = options.sort ?? "startedAt";
  const order = options.order ?? "desc";
  const offset = (page - 1) * pageSize;
  const { filters, params } = runWhere(projectId, options);
  const sortExpression = runSortColumns[sort];
  const [result, countResult] = await Promise.all([
    client.query({
      query: `SELECT
                project_id,
                trace_id,
                span_id,
                parent_span_id,
                name,
                trace_name,
                observation_kind,
                status,
                status_message,
                start_time,
                end_time,
                toString(duration_nano) AS duration_nano,
                service_name,
                model,
                environment,
                release,
                version,
                service_version,
                user_id,
                session_id,
                tags,
                input_tokens,
                output_tokens,
                total_tokens,
                input_cost,
                output_cost,
                total_cost,
                if(input IS NULL, NULL, substringUTF8(input, 1, 4096)) AS input_snippet,
                if(output IS NULL, NULL, substringUTF8(output, 1, 4096)) AS output_snippet
              FROM spans FINAL
              WHERE ${filters.join(" AND ")}
              ORDER BY isNull(${sortExpression}) ASC, ${sortExpression} ${order.toUpperCase()}, start_time DESC, span_id DESC
              LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}`,
      query_params: { ...params, pageSize, offset },
      format: "JSONEachRow",
    }),
    client.query({
      query: `SELECT count() AS total FROM spans FINAL
              WHERE ${filters.join(" AND ")}`,
      query_params: params,
      format: "JSONEachRow",
    }),
  ]);
  const rows = await result.json<RunListRow>();
  const counts = await countResult.json<{ total: number | string }>();
  const total = numeric(counts[0]?.total);
  return {
    items: rows.map(runListItemFromRow),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function listRunFacets(
  client: ClickHouseClient,
  projectId: string,
  options: RunFilters,
): Promise<RunFacets> {
  const facets = Object.keys({ ...runFacetColumns, tag: "tags" }) as RunFacet[];
  const values = await Promise.all(
    facets.map(async (facet) => {
      const { filters, params } = runWhere(projectId, options, facet);
      const result = await client.query({
        query:
          facet === "tag"
            ? `SELECT tag AS value, count() AS count
               FROM (SELECT tags FROM spans FINAL WHERE ${filters.join(" AND ")})
               ARRAY JOIN tags AS tag
               WHERE tag != ''
               GROUP BY tag ORDER BY count DESC, value ASC LIMIT 50`
            : `SELECT toString(${runFacetColumns[facet]}) AS value, count() AS count
               FROM spans FINAL
               WHERE ${filters.join(" AND ")} AND ifNull(toString(${runFacetColumns[facet]}), '') != ''
               GROUP BY ${runFacetColumns[facet]} ORDER BY count DESC, value ASC LIMIT 50`,
        query_params: params,
        format: "JSONEachRow",
      });
      const rows = await result.json<{ value: string; count: number | string }>();
      return [facet, rows.map((row) => ({ value: row.value, count: numeric(row.count) }))] as const;
    }),
  );
  return Object.fromEntries(values) as RunFacets;
}

function runWhere(
  projectId: string,
  options: RunFilters,
  omit?: RunFacet,
): { filters: string[]; params: Record<string, string | number | string[]> } {
  const filters = ["project_id = {projectId:UUID}"];
  const params: Record<string, string | number | string[]> = { projectId };
  if (options.from !== undefined) {
    filters.push("start_time >= {from:DateTime64(3)}");
    params.from = clickHouseDateTimeParam(options.from);
  }
  if (options.to !== undefined) {
    filters.push("start_time <= {to:DateTime64(3)}");
    params.to = clickHouseDateTimeParam(options.to);
  }
  for (const [field, column, facet] of [
    ["observationKinds", "observation_kind", "observationKind"],
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
  if (options.search !== undefined) {
    filters.push(
      "(positionCaseInsensitive(name, {search:String}) > 0 OR positionCaseInsensitive(span_id, {search:String}) > 0 OR positionCaseInsensitive(trace_id, {search:String}) > 0 OR positionCaseInsensitive(ifNull(model, ''), {search:String}) > 0)",
    );
    params.search = options.search;
  }
  for (const [field, column, operator] of [
    ["minDurationMs", "(duration_nano / 1000000)", ">="],
    ["maxDurationMs", "(duration_nano / 1000000)", "<="],
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

function runListItemFromRow(row: RunListRow): RunListItem {
  const durationMs = Math.max(0, Number(BigInt(row.duration_nano || "0")) / 1_000_000);
  return {
    projectId: row.project_id,
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id || null,
    name: row.name,
    traceName: row.trace_name,
    observationKind: row.observation_kind,
    status: row.status,
    statusMessage: row.status_message,
    startedAt: ensureIso(row.start_time),
    endedAt: ensureIso(row.end_time),
    durationMs,
    serviceName: row.service_name,
    model: row.model,
    environment: row.environment || "default",
    release: row.release,
    version: row.version,
    serviceVersion: row.service_version,
    userId: row.user_id,
    sessionId: row.session_id,
    tags: row.tags,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
    inputPreview: extractPayloadPreview(row.input_snippet, "input", 240),
    outputPreview: extractPayloadPreview(row.output_snippet, "output", 240),
  };
}
