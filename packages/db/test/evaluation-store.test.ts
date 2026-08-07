import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { listEvaluations } from "../src/evaluation-store.js";

type QueryOptions = {
  query: string;
  query_params?: Record<string, unknown>;
};

describe("evaluation queries", () => {
  it("filters both evaluation rows and their count by run ID", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () => (sql.includes("count() AS total") ? [{ total: "0" }] : []),
    }));
    const client = { query } as unknown as ClickHouseClient;

    await listEvaluations(client, "11111111-1111-4111-8111-111111111111", {
      runIds: ["run-1"],
      pageSize: 100,
    });

    expect(query).toHaveBeenCalledTimes(2);
    for (const [options] of query.mock.calls) {
      expect(options.query).toContain("run_id IN {runIds:Array(String)}");
      expect(options.query_params).toMatchObject({ runIds: ["run-1"] });
    }
  });
});
