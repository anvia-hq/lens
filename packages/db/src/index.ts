import { type ClickHouseClient, type ClickHouseSettings, createClient } from "@clickhouse/client";
import { type LensConfig, loadConfig } from "@lens/config";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type { ClickHouseClient } from "@clickhouse/client";

export type LensPostgres = PostgresJsDatabase<typeof schema>;

export type PostgresConnection = {
  db: LensPostgres;
  sql: Sql;
  close: () => Promise<void>;
};

export function createPostgres(config: LensConfig = loadConfig()): PostgresConnection {
  const sql = postgres(config.POSTGRES_URL, { max: config.POSTGRES_MAX_CONNECTIONS });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end(),
  };
}

export function createClickHouse(config: LensConfig = loadConfig()): ClickHouseClient {
  const clickhouseSettings: ClickHouseSettings = {
    date_time_input_format: "best_effort",
    output_format_json_quote_64bit_integers: 0,
  };
  if (config.CLICKHOUSE_MAX_THREADS > 0) {
    clickhouseSettings.max_threads = config.CLICKHOUSE_MAX_THREADS;
  }
  if (config.CLICKHOUSE_MAX_MEMORY_USAGE_BYTES > 0) {
    clickhouseSettings.max_memory_usage = String(config.CLICKHOUSE_MAX_MEMORY_USAGE_BYTES);
  }
  if (config.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY > 0) {
    clickhouseSettings.max_bytes_before_external_group_by = String(
      config.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_GROUP_BY,
    );
  }
  if (config.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_SORT > 0) {
    clickhouseSettings.max_bytes_before_external_sort = String(
      config.CLICKHOUSE_MAX_BYTES_BEFORE_EXTERNAL_SORT,
    );
  }
  return createClient({
    url: config.CLICKHOUSE_URL,
    database: config.CLICKHOUSE_DATABASE,
    username: config.CLICKHOUSE_USERNAME,
    password: config.CLICKHOUSE_PASSWORD,
    clickhouse_settings: clickhouseSettings,
  });
}

export * from "./alert-channel-store.js";
export * from "./alert-measurement.js";
export * from "./alert-store.js";
export * from "./data-deletion-store.js";
export * from "./evaluation-dataset-store.js";
export * from "./evaluation-run-store.js";
export * from "./evaluation-store.js";
export * from "./job-outbox-store.js";
export * from "./managed-dataset-store.js";
export * from "./metrics-store.js";
export * from "./model-costs.js";
export * from "./quality-gate-store.js";
export * from "./schema.js";
export * from "./system-health-store.js";
export {
  deleteProjectTelemetry,
  getSession,
  getSpan,
  getTrace,
  getTraceExpiration,
  getTraceSummary,
  getUser,
  insertSpans,
  listSessionFacets,
  listSessions,
  listTraceFacets,
  listTraces,
  listTracesByIds,
  listUsers,
  materializeTrace,
  reconcileProjectRetention,
} from "./telemetry-store.js";
