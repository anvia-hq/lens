import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type LensConfig, loadConfig } from "@lens/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrateAlertChannelSecrets } from "./alert-channel-migration.js";
import { loadAlertSecretKeyring } from "./alert-secrets.js";
import { createClickHouse, createPostgres } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_ADVISORY_LOCK_KEY = 741852963;

const TRANSIENT_ERROR_CODES = new Set([
  // Node / socket / fetch startup errors
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  // postgres.js client connection lifecycle errors
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECT_TIMEOUT",
  // PostgreSQL startup / restart / connection-exception SQLSTATEs
  "57P01",
  "57P02",
  "57P03",
  "08000",
  "08001",
  "08006",
]);

const TRANSIENT_MESSAGE_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|the database system is (?:starting up|shutting down)|database .* does not exist/i;

export type RetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export function isTransientMigrationError(error: unknown, seen = new Set<unknown>()): boolean {
  if (error === null || error === undefined || seen.has(error)) return false;
  seen.add(error);

  if (typeof error === "object") {
    const record = error as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    if (typeof record.code === "string" && TRANSIENT_ERROR_CODES.has(record.code)) return true;
    if (typeof record.message === "string" && TRANSIENT_MESSAGE_PATTERN.test(record.message)) {
      return true;
    }
    if (record.cause !== undefined && isTransientMigrationError(record.cause, seen)) return true;
    if (
      Array.isArray(record.errors) &&
      record.errors.some((item) => isTransientMigrationError(item, seen))
    ) {
      return true;
    }
  }
  return false;
}

export async function retryTransient<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 20;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientMigrationError(error)) {
        throw error;
      }
      const delayMs = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1));
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

export async function runMigrations(
  config: LensConfig = loadConfig(),
  retryOptions: RetryOptions = {},
): Promise<void> {
  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);
  let lockConnection: Awaited<ReturnType<typeof postgres.sql.reserve>> | undefined;

  const withRetry = (target: string): RetryOptions => ({
    onRetry: (error, attempt, delayMs) => {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `migrate: waiting for ${target} (attempt ${attempt}, retrying in ${delayMs}ms): ${reason}`,
      );
    },
    ...retryOptions,
  });

  try {
    lockConnection = await retryTransient(async () => {
      const connection = await postgres.sql.reserve();
      try {
        await connection`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
        return connection;
      } catch (error) {
        connection.release();
        throw error;
      }
    }, withRetry("PostgreSQL"));
    await migrate(postgres.db, { migrationsFolder: resolve(here, "../migrations/postgres") });
    // Encrypt any pre-existing plaintext alert channel secrets so delivery
    // keeps working after the upgrade. Idempotent: rows already in the
    // envelope format are skipped.
    const keyring = loadAlertSecretKeyring(process.env);
    const result = await migrateAlertChannelSecrets(postgres.db, keyring);
    if (result.encrypted > 0) {
      console.log(
        `alert channel secrets: encrypted ${result.encrypted} plaintext row(s) (scanned ${result.scanned})`,
      );
    }
    await retryTransient(
      () =>
        clickhouse.command({
          query: `CREATE TABLE IF NOT EXISTS schema_migrations
                  (filename String, applied_at DateTime64(3, 'UTC') DEFAULT now64(3))
                  ENGINE = MergeTree ORDER BY filename`,
        }),
      withRetry("ClickHouse"),
    );
    const appliedResult = await clickhouse.query({
      query: "SELECT DISTINCT filename FROM schema_migrations",
      format: "JSONEachRow",
    });
    const applied = new Set(
      (await appliedResult.json<{ filename: string }>()).map((row) => row.filename),
    );
    const clickhouseFolder = resolve(here, "../migrations/clickhouse");
    for (const filename of (await readdir(clickhouseFolder))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (applied.has(filename)) continue;
      const sql = await readFile(resolve(clickhouseFolder, filename), "utf8");
      for (const statement of sql
        .split(/;\s*(?:\n|$)/)
        .map((value) => value.trim())
        .filter(Boolean)) {
        await clickhouse.command({ query: statement });
      }
      await clickhouse.insert({
        table: "schema_migrations",
        format: "JSONEachRow",
        values: [{ filename }],
      });
    }
  } finally {
    if (lockConnection !== undefined) {
      await lockConnection`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_KEY})`.catch(
        () => undefined,
      );
      lockConnection.release();
    }
    await postgres.close();
    await clickhouse.close();
  }
}
