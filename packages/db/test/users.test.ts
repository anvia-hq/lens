import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { getUser, listUsers } from "../src/telemetry-store.js";

type QueryOptions = { query: string; query_params?: Record<string, unknown> };
const projectId = "11111111-1111-4111-8111-111111111111";

describe("traced user queries", () => {
  it("aggregates range usage while retaining lifetime activity timestamps", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () =>
        sql.includes("count() AS total")
          ? [{ total: "1" }]
          : [
              {
                project_id: projectId,
                user_id: "customer-1",
                first_seen_at: "2026-07-01 00:00:00.000",
                last_seen_at: "2026-08-05 00:00:00.000",
                trace_count: "4",
                session_count: "2",
                error_count: "1",
                input_tokens: "100",
                output_tokens: "50",
                total_tokens: "150",
                input_cost: "0.01",
                output_cost: "0.02",
                total_cost: "0.03",
              },
            ],
    }));

    const page = await listUsers({ query } as unknown as ClickHouseClient, projectId, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-06T00:00:00.000Z",
      search: "customer",
      sort: "totalCost",
      order: "desc",
      page: 1,
      pageSize: 25,
    });

    expect(page.items[0]).toMatchObject({
      userId: "customer-1",
      traceCount: 4,
      sessionCount: 2,
      errorCount: 1,
      errorRate: 0.25,
      totalTokens: 150,
      totalCost: 0.03,
      firstSeenAt: "2026-07-01T00:00:00.000Z",
    });
    const listCall = query.mock.calls.find(([options]) => options.query.includes("ORDER BY"));
    expect(listCall?.[0].query).toContain("user_id IS NOT NULL");
    expect(listCall?.[0].query).toContain("user_id != ''");
    expect(listCall?.[0].query).toContain("countIf(1 AND started_at >=");
    expect(listCall?.[0].query).toContain("uniqExactIf");
    expect(listCall?.[0].query).toContain("total_cost DESC");
    expect(listCall?.[0].query_params).toMatchObject({
      projectId,
      search: "customer",
      pageSize: 25,
      offset: 0,
    });
  });

  it("uses an exact case-sensitive user identity for details", async () => {
    const query = vi.fn(async (_options: QueryOptions) => ({ json: async () => [] }));
    const user = await getUser({ query } as unknown as ClickHouseClient, projectId, "Customer/One");

    expect(user).toBeUndefined();
    expect(query.mock.calls[0]?.[0].query).toContain("user_id = {exactUserId:String}");
    expect(query.mock.calls[0]?.[0].query_params).toMatchObject({
      exactUserId: "Customer/One",
    });
  });
});
