import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@lens/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createClickHouse, createPostgres } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const postgres = createPostgres(config);
const clickhouse = createClickHouse(config);

try {
  await migrate(postgres.db, { migrationsFolder: resolve(here, "../migrations/postgres") });
  const clickhouseFolder = resolve(here, "../migrations/clickhouse");
  for (const filename of (await readdir(clickhouseFolder))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(resolve(clickhouseFolder, filename), "utf8");
    for (const statement of sql
      .split(/;\s*(?:\n|$)/)
      .map((value) => value.trim())
      .filter(Boolean)) {
      await clickhouse.command({ query: statement });
    }
  }
} finally {
  await postgres.close();
  await clickhouse.close();
}
