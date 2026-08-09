import type { ClickHouseClient } from "@clickhouse/client";
import type { AlertIncidentEvidence } from "@lens/contracts";
import type { StoredAlertRule } from "./alert-store.js";
import { clickHouseDateTimeParam, numeric } from "./values.js";

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
              arraySlice(groupUniqArray(trace_id), 1, 5) AS trace_ids
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
            arraySlice(groupUniqArray(trace_id), 1, 5) AS trace_ids
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

type MeasurementRow = Record<string, number | string | string[] | null>;

async function measurementRow(
  client: ClickHouseClient,
  query: string,
  queryParams: Record<string, string>,
): Promise<MeasurementRow> {
  const result = await client.query({ query, query_params: queryParams, format: "JSONEachRow" });
  return (await result.json<MeasurementRow>())[0] ?? {};
}

function stringArray(value: MeasurementRow[string] | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function numericValue(value: MeasurementRow[string] | undefined): number {
  return Array.isArray(value) ? 0 : numeric(value);
}
