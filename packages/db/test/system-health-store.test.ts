import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { queryClickHouseCapacity, queryPostgresDatabaseBytes } from "../src/system-health-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

describe("system health storage probes", () => {
  it("reports the current PostgreSQL database size", async () => {
    const sql = vi.fn().mockResolvedValue([{ database_bytes: "4096" }]) as unknown as Sql;
    await expect(queryPostgresDatabaseBytes(sql)).resolves.toBe(4096);
  });

  it("cancels the PostgreSQL query when its probe is aborted", async () => {
    const controller = new AbortController();
    let rejectQuery: ((error: Error) => void) | undefined;
    const query = Object.assign(
      new Promise<never>((_, reject) => {
        rejectQuery = reject;
      }),
      {
        cancel: vi.fn(() => rejectQuery?.(new Error("query cancelled"))),
      },
    );
    const sql = vi.fn().mockReturnValue(query) as unknown as Sql;

    const pending = queryPostgresDatabaseBytes(sql, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow("query cancelled");
    expect(query.cancel).toHaveBeenCalledOnce();
  });

  it("reports ClickHouse data and disk capacity", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve([{ database_bytes: "8192" }]) })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve([
            {
              name: "default",
              path: "/var/lib/clickhouse",
              total_space: 10_000,
              free_space: 2_000,
            },
          ]),
      });

    const signal = new AbortController().signal;
    await expect(
      queryClickHouseCapacity(clickHouseClient({ query }), "lens", signal),
    ).resolves.toEqual({
      databaseBytes: 8192,
      disks: [
        {
          name: "default",
          path: "/var/lib/clickhouse",
          totalBytes: 10_000,
          availableBytes: 2_000,
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, expect.objectContaining({ abort_signal: signal }));
    expect(query).toHaveBeenNthCalledWith(2, expect.objectContaining({ abort_signal: signal }));
  });
});
