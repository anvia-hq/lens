import type { ClickHouseClient } from "@clickhouse/client";
import type { Sql } from "postgres";

export type ClickHouseDiskCapacity = {
  name: string;
  path: string;
  totalBytes: number;
  availableBytes: number;
};

export async function queryPostgresDatabaseBytes(sql: Sql, signal?: AbortSignal): Promise<number> {
  const query = sql<{ database_bytes: string }[]>`
    SELECT pg_database_size(current_database())::text AS database_bytes
  `;
  const cancel = () => query.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const [row] = await query;
    return numeric(row?.database_bytes);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

export async function queryClickHouseCapacity(
  client: ClickHouseClient,
  database: string,
  signal?: AbortSignal,
): Promise<{ databaseBytes: number; disks: ClickHouseDiskCapacity[] }> {
  const [sizeResult, disksResult] = await Promise.all([
    client.query({
      query: `
        SELECT sum(bytes_on_disk) AS database_bytes
        FROM system.parts
        WHERE active AND database = {database:String}
      `,
      query_params: { database },
      format: "JSONEachRow",
      ...(signal === undefined ? {} : { abort_signal: signal }),
    }),
    client.query({
      query: `
        SELECT name, path, total_space, free_space
        FROM system.disks
        ORDER BY name
      `,
      format: "JSONEachRow",
      ...(signal === undefined ? {} : { abort_signal: signal }),
    }),
  ]);
  const sizes = await sizeResult.json<Array<{ database_bytes: number | string }>[number]>();
  const disks =
    await disksResult.json<
      Array<{
        name: string;
        path: string;
        total_space: number | string;
        free_space: number | string;
      }>[number]
    >();
  return {
    databaseBytes: numeric(sizes[0]?.database_bytes),
    disks: disks.map((disk) => ({
      name: disk.name,
      path: disk.path,
      totalBytes: numeric(disk.total_space),
      availableBytes: numeric(disk.free_space),
    })),
  };
}

function numeric(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
