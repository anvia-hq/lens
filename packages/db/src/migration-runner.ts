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

export async function runMigrations(config: LensConfig = loadConfig()): Promise<void> {
  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);
  let lockConnection: Awaited<ReturnType<typeof postgres.sql.reserve>> | undefined;

  try {
    lockConnection = await postgres.sql.reserve();
    await lockConnection`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
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
    await clickhouse.command({
      query: `CREATE TABLE IF NOT EXISTS schema_migrations
              (filename String, applied_at DateTime64(3, 'UTC') DEFAULT now64(3))
              ENGINE = MergeTree ORDER BY filename`,
    });
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
