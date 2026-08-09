import type { ClickHouseClient } from "@clickhouse/client";
import type {
  AlertContributorAnalysis,
  AlertContributorDimension,
  AlertContributorHint,
  AlertIncident,
  AlertIncidentEvidence,
  AlertRuleInput,
  AlertSignalSeries,
} from "@lens/contracts";
import type { StoredAlertRule } from "./alert-store.js";
import { clickHouseDateTimeParam, ensureIso, numeric } from "./values.js";

export type AlertMeasurement = {
  value: number;
  sampleCount: number;
  evidence: AlertIncidentEvidence;
};

export async function queryAlertMeasurement(
  client: ClickHouseClient,
  rule: StoredAlertRule,
  now = new Date(),
): Promise<AlertMeasurement | undefined> {
  if (!("windowMinutes" in rule)) return undefined;
  const from = new Date(now.getTime() - rule.windowMinutes * 60_000);
  const params: Record<string, string> = {
    projectId: rule.projectId,
    from: clickHouseDateTimeParam(from.toISOString()),
    to: clickHouseDateTimeParam(now.toISOString()),
  };
  const filters = ["project_id = {projectId:UUID}"];
  if (rule.environment) {
    filters.push("environment = {environment:String}");
    params.environment = rule.environment;
  }
  if (rule.serviceName) {
    filters.push("service_name = {serviceName:String}");
    params.serviceName = rule.serviceName;
  }
  if (rule.kind === "tool_error_rate") {
    filters.push(
      "observation_kind = 'tool'",
      "start_time >= {from:DateTime64(3)}",
      "start_time <= {to:DateTime64(3)}",
    );
    if (rule.toolName) {
      filters.push("name = {toolName:String}");
      params.toolName = rule.toolName;
    }
    const row = await measurementRow(
      client,
      `SELECT count() AS samples, countIf(status = 'error') AS errors,
              groupUniqArrayIf(5)(trace_id, status = 'error') AS trace_ids
       FROM spans FINAL WHERE ${filters.join(" AND ")}`,
      params,
    );
    const samples = numericValue(row.samples);
    return {
      value: samples === 0 ? 0 : numericValue(row.errors) / samples,
      sampleCount: samples,
      evidence: { traceIds: stringArray(row.trace_ids) },
    };
  }
  filters.push("started_at >= {from:DateTime64(3)}", "started_at <= {to:DateTime64(3)}");
  const row = await measurementRow(
    client,
    `SELECT count() AS samples, countIf(status = 'error') AS errors,
            quantileExact(0.95)(duration_ms) AS p95,
            ${
              rule.kind === "trace_error_rate"
                ? "groupUniqArrayIf(5)(trace_id, status = 'error')"
                : "arrayMap(item -> item.2, arraySlice(arrayReverseSort(groupArray((duration_ms, trace_id))), 1, 5))"
            } AS trace_ids
     FROM trace_summaries FINAL WHERE ${filters.join(" AND ")}`,
    params,
  );
  const samples = numericValue(row.samples);
  return {
    value:
      rule.kind === "trace_error_rate"
        ? samples === 0
          ? 0
          : numericValue(row.errors) / samples
        : numericValue(row.p95),
    sampleCount: samples,
    evidence: { traceIds: stringArray(row.trace_ids) },
  };
}

export async function queryAlertSignalSeries(
  client: ClickHouseClient,
  projectId: string,
  rule: AlertRuleInput,
  incident: AlertIncident,
  now = new Date(),
): Promise<AlertSignalSeries | null> {
  if (!("windowMinutes" in rule)) return null;
  const range = resolveAlertSignalRange(rule.windowMinutes, incident, now);
  const params: Record<string, string> = {
    projectId,
    from: clickHouseDateTimeParam(range.from),
    to: clickHouseDateTimeParam(range.to),
  };
  const filters = ["project_id = {projectId:UUID}"];
  if (rule.environment) {
    filters.push("environment = {environment:String}");
    params.environment = rule.environment;
  }
  if (rule.serviceName) {
    filters.push("service_name = {serviceName:String}");
    params.serviceName = rule.serviceName;
  }
  const interval = `INTERVAL ${range.bucketMinutes} MINUTE`;
  let timestampColumn = "started_at";
  const valueSql =
    rule.kind === "trace_p95_latency_ms"
      ? "quantileExact(0.95)(duration_ms)"
      : "countIf(status = 'error') / count()";
  if (rule.kind === "tool_error_rate") {
    timestampColumn = "start_time";
    filters.push("observation_kind = 'tool'");
    if (rule.toolName) {
      filters.push("name = {toolName:String}");
      params.toolName = rule.toolName;
    }
  }
  filters.push(
    `${timestampColumn} >= {from:DateTime64(3)}`,
    `${timestampColumn} <= {to:DateTime64(3)}`,
  );
  const rows = await signalRows(
    client,
    `SELECT toStartOfInterval(${timestampColumn}, ${interval}) AS timestamp,
            count() AS samples, ${valueSql} AS value
     FROM ${rule.kind === "tool_error_rate" ? "spans" : "trace_summaries"} FINAL
     WHERE ${filters.join(" AND ")}
     GROUP BY timestamp ORDER BY timestamp ASC`,
    params,
  );
  const values = new Map(
    rows.map((row) => [
      new Date(ensureIso(String(row.timestamp ?? ""))).toISOString(),
      { value: numericValue(row.value), sampleCount: numericValue(row.samples) },
    ]),
  );
  const points: AlertSignalSeries["points"] = [];
  const bucketMs = range.bucketMinutes * 60_000;
  for (
    let timestamp = Date.parse(range.from);
    timestamp <= Date.parse(range.to);
    timestamp += bucketMs
  ) {
    const iso = new Date(timestamp).toISOString();
    const point = values.get(iso);
    points.push({
      timestamp: iso,
      value: point?.value ?? null,
      sampleCount: point?.sampleCount ?? 0,
    });
  }
  return { ...range, points };
}

export async function queryAlertContributorAnalysis(
  client: ClickHouseClient,
  projectId: string,
  rule: AlertRuleInput,
  incident: AlertIncident,
): Promise<AlertContributorAnalysis | null> {
  if (!("windowMinutes" in rule)) return null;
  const range = resolveAlertContributorRange(rule.windowMinutes, incident);
  const params: Record<string, string> = {
    projectId,
    baselineFrom: clickHouseDateTimeParam(range.baselineFrom),
    breachFrom: clickHouseDateTimeParam(range.breachFrom),
    breachTo: clickHouseDateTimeParam(range.breachTo),
  };
  const filters = ["project_id = {projectId:UUID}"];
  if (rule.environment) {
    filters.push("environment = {environment:String}");
    params.environment = rule.environment;
  }
  if (rule.serviceName) {
    filters.push("service_name = {serviceName:String}");
    params.serviceName = rule.serviceName;
  }

  const rows = await Promise.all([
    rule.kind === "tool_error_rate"
      ? Promise.resolve([])
      : queryContributorRows(client, traceContributorSql(filters, rule.kind), params, "trace"),
    queryContributorRows(
      client,
      toolContributorSql(
        filters,
        rule.kind,
        Boolean(rule.kind === "tool_error_rate" && rule.toolName),
      ),
      {
        ...params,
        ...(rule.kind === "tool_error_rate" && rule.toolName ? { toolName: rule.toolName } : {}),
      },
      "tool",
    ),
  ]).then((items) => items.flat());

  const hints = contributorHints(rows, rule.kind);
  return {
    ...range,
    hints,
    unavailableReason: rows.some((row) => row.period === "breach" && row.samples > 0)
      ? hints.length
        ? null
        : "insufficient_data"
      : "telemetry_expired",
  };
}

export function resolveAlertContributorRange(
  windowMinutes: number,
  incident: Pick<AlertIncident, "firstTriggeredAt">,
): Omit<AlertContributorAnalysis, "hints" | "unavailableReason"> {
  const breachTo = Date.parse(incident.firstTriggeredAt);
  const breachFrom = breachTo - windowMinutes * 60_000;
  return {
    baselineFrom: new Date(breachFrom - windowMinutes * 60_000).toISOString(),
    baselineTo: new Date(breachFrom).toISOString(),
    breachFrom: new Date(breachFrom).toISOString(),
    breachTo: new Date(breachTo).toISOString(),
  };
}

export function resolveAlertSignalRange(
  windowMinutes: number,
  incident: Pick<AlertIncident, "firstTriggeredAt" | "resolvedAt">,
  now = new Date(),
): Omit<AlertSignalSeries, "points"> {
  const contextMinutes = Math.max(60, windowMinutes * 2);
  const resolvedEnd = incident.resolvedAt
    ? Date.parse(incident.resolvedAt) + Math.max(30, windowMinutes) * 60_000
    : now.getTime();
  const toMs = Math.min(now.getTime(), resolvedEnd);
  const fromMs = Math.max(
    Date.parse(incident.firstTriggeredAt) - contextMinutes * 60_000,
    toMs - 24 * 60 * 60_000,
  );
  const bucketMinutes = toMs - fromMs <= 6 * 60 * 60_000 ? 1 : 5;
  const bucketMs = bucketMinutes * 60_000;
  return {
    from: new Date(Math.floor(fromMs / bucketMs) * bucketMs).toISOString(),
    to: new Date(Math.floor(toMs / bucketMs) * bucketMs).toISOString(),
    bucketMinutes,
  };
}

type MeasurementRow = Record<string, number | string | string[] | null>;

type ContributorRow = {
  source: "trace" | "tool";
  period: "baseline" | "breach";
  dimension: AlertContributorDimension | "__all__";
  value: string;
  samples: number;
  errors: number;
  p95: number;
  traceId: string | null;
};

function traceContributorSql(filters: string[], kind: AlertRuleInput["kind"]) {
  const representative =
    kind === "trace_p95_latency_ms"
      ? "argMax(toString(trace_id), duration_ms)"
      : "if(countIf(status = 'error') > 0, argMaxIf(toString(trace_id), started_at, status = 'error'), argMax(toString(trace_id), started_at))";
  const aggregate = `count() AS samples, countIf(status = 'error') AS errors,
    quantileExact(0.95)(duration_ms) AS p95, ${representative} AS trace_id`;
  const where = `${filters.join(" AND ")} AND started_at >= {baselineFrom:DateTime64(3)} AND started_at <= {breachTo:DateTime64(3)}`;
  return `SELECT period, tupleElement(dimension_tuple, 1) AS dimension,
      tupleElement(dimension_tuple, 2) AS value, ${aggregate}
    FROM (
      SELECT *, if(started_at < {breachFrom:DateTime64(3)}, 'baseline', 'breach') AS period,
        arrayJoin([
          ('release', ifNull(release, '')),
          ('service', toString(service_name)),
          ('serviceVersion', ifNull(service_version, '')),
          ('model', ifNull(model, ''))
        ]) AS dimension_tuple
      FROM trace_summaries FINAL WHERE ${where}
    )
    WHERE tupleElement(dimension_tuple, 2) != ''
    GROUP BY period, dimension, value
    UNION ALL
    SELECT if(started_at < {breachFrom:DateTime64(3)}, 'baseline', 'breach') AS period,
      '__all__' AS dimension, '__all__' AS value, ${aggregate}
    FROM trace_summaries FINAL WHERE ${where}
    GROUP BY period`;
}

function toolContributorSql(filters: string[], kind: AlertRuleInput["kind"], scopedTool: boolean) {
  const dimensions =
    kind === "tool_error_rate"
      ? [
          "('release', ifNull(release, ''))",
          "('service', toString(service_name))",
          "('serviceVersion', ifNull(service_version, ''))",
          ...(scopedTool ? [] : ["('tool', toString(name))"]),
        ]
      : ["('tool', toString(name))"];
  const representative =
    kind === "trace_p95_latency_ms"
      ? "argMax(toString(trace_id), duration_nano)"
      : "if(countIf(status = 'error') > 0, argMaxIf(toString(trace_id), start_time, status = 'error'), argMax(toString(trace_id), start_time))";
  const aggregate = `count() AS samples, countIf(status = 'error') AS errors,
    quantileExact(0.95)(duration_nano / 1000000) AS p95, ${representative} AS trace_id`;
  const toolFilter = scopedTool ? " AND name = {toolName:String}" : "";
  const where = `${filters.join(" AND ")} AND observation_kind = 'tool'${toolFilter} AND start_time >= {baselineFrom:DateTime64(3)} AND start_time <= {breachTo:DateTime64(3)}`;
  return `SELECT period, tupleElement(dimension_tuple, 1) AS dimension,
      tupleElement(dimension_tuple, 2) AS value, ${aggregate}
    FROM (
      SELECT *, if(start_time < {breachFrom:DateTime64(3)}, 'baseline', 'breach') AS period,
        arrayJoin([${dimensions.join(", ")}]) AS dimension_tuple
      FROM spans FINAL WHERE ${where}
    )
    WHERE tupleElement(dimension_tuple, 2) != ''
    GROUP BY period, dimension, value
    UNION ALL
    SELECT if(start_time < {breachFrom:DateTime64(3)}, 'baseline', 'breach') AS period,
      '__all__' AS dimension, '__all__' AS value, ${aggregate}
    FROM spans FINAL WHERE ${where}
    GROUP BY period`;
}

async function queryContributorRows(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
  source: ContributorRow["source"],
): Promise<ContributorRow[]> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return (await result.json<MeasurementRow>()).map((row) => ({
    source,
    period: row.period === "baseline" ? "baseline" : "breach",
    dimension: String(row.dimension) as ContributorRow["dimension"],
    value: String(row.value ?? ""),
    samples: numericValue(row.samples),
    errors: numericValue(row.errors),
    p95: numericValue(row.p95),
    traceId: row.trace_id ? String(row.trace_id) : null,
  }));
}

function contributorHints(
  rows: ContributorRow[],
  kind: AlertRuleInput["kind"],
): AlertContributorHint[] {
  const all = new Map(
    rows
      .filter((row) => row.dimension === "__all__")
      .map((row) => [`${row.source}:${row.period}`, row]),
  );
  const candidates = rows.flatMap((breach) => {
    if (breach.period !== "breach" || breach.dimension === "__all__" || breach.samples < 5)
      return [];
    const matching = rows.find(
      (row) =>
        row.source === breach.source &&
        row.period === "baseline" &&
        row.dimension === breach.dimension &&
        row.value === breach.value,
    );
    const baseline = matching ?? all.get(`${breach.source}:baseline`);
    const breachAll = all.get(`${breach.source}:breach`);
    const isNew = !matching;
    if (!baseline || baseline.samples < 5 || !breachAll) return [];
    if (isNew && breach.samples / breachAll.samples < 0.2) return [];
    const dimensionRows = rows.filter(
      (row) => row.source === breach.source && row.dimension === breach.dimension,
    );
    if (matching && new Set(dimensionRows.map((row) => row.value)).size === 1) return [];

    const metric = kind === "trace_p95_latency_ms" ? "p95DurationMs" : "errorRate";
    const baselineValue =
      metric === "errorRate" ? baseline.errors / baseline.samples : baseline.p95;
    const breachValue = metric === "errorRate" ? breach.errors / breach.samples : breach.p95;
    const delta = breachValue - baselineValue;
    const percentChange =
      metric === "p95DurationMs" && baselineValue > 0 ? delta / baselineValue : null;
    if (
      (metric === "errorRate" && (delta < 0.05 || breach.errors < 2)) ||
      (metric === "p95DurationMs" && (delta < 250 || (percentChange ?? 0) < 0.25))
    ) {
      return [];
    }
    return [
      {
        hint: {
          dimension: breach.dimension,
          value: breach.value,
          metric,
          baseline: { sampleCount: baseline.samples, value: baselineValue },
          breach: { sampleCount: breach.samples, value: breachValue },
          delta,
          percentChange,
          isNew,
          baselineTraceId: baseline.traceId,
          breachTraceId: breach.traceId,
        } satisfies AlertContributorHint,
        severity:
          metric === "errorRate"
            ? delta / 0.05
            : Math.min(delta / 250, (percentChange ?? 0) / 0.25),
      },
    ];
  });

  const strongestByDimension = new Map<AlertContributorDimension, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const current = strongestByDimension.get(candidate.hint.dimension);
    if (
      !current ||
      candidate.hint.breach.sampleCount > current.hint.breach.sampleCount ||
      (candidate.hint.breach.sampleCount === current.hint.breach.sampleCount &&
        candidate.severity > current.severity)
    ) {
      strongestByDimension.set(candidate.hint.dimension, candidate);
    }
  }
  return [...strongestByDimension.values()]
    .sort(
      (left, right) =>
        right.hint.breach.sampleCount - left.hint.breach.sampleCount ||
        right.severity - left.severity,
    )
    .slice(0, 3)
    .map((candidate) => candidate.hint);
}

async function measurementRow(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
): Promise<MeasurementRow> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return (await result.json<MeasurementRow>())[0] ?? {};
}

async function signalRows(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
): Promise<MeasurementRow[]> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return result.json<MeasurementRow>();
}

function stringArray(value: MeasurementRow[string] | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function numericValue(value: MeasurementRow[string] | undefined): number {
  return Array.isArray(value) ? 0 : numeric(value);
}
