import { type ClickHouseClient, createClient } from "@clickhouse/client";
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
  const sql = postgres(config.POSTGRES_URL, { max: 10 });
  return {
    db: drizzle(sql, { schema }),
    sql,
    close: () => sql.end(),
  };
}

export function createClickHouse(config: LensConfig = loadConfig()): ClickHouseClient {
  return createClient({
    url: config.CLICKHOUSE_URL,
    database: config.CLICKHOUSE_DATABASE,
    username: config.CLICKHOUSE_USERNAME,
    password: config.CLICKHOUSE_PASSWORD,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
      output_format_json_quote_64bit_integers: 0,
    },
  });
}

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
