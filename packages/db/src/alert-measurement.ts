import type { ClickHouseClient } from "@clickhouse/client";
import type {
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
