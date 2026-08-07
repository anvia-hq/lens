import { describe, expect, it, vi } from "vitest";
import { listTraceFacets, listTraces } from "../src/telemetry-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

type QueryOptions = {
  query: string;
  query_params?: Record<string, unknown>;
};

describe("trace explorer queries", () => {
  it("applies server-side filters, sorting, and pagination", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () => (sql.includes("count() AS total") ? [{ total: "73" }] : []),
    }));
    const client = clickHouseClient({ query });

    const page = await listTraces(client, "11111111-1111-4111-8111-111111111111", {
      statuses: ["error"],
      models: ["gpt-4.1"],
      tags: ["production", "priority"],
      minTotalCost: 0.01,
      exactUserId: "customer-1",
      page: 2,
      pageSize: 25,
      sort: "totalCost",
      order: "asc",
    });

    expect(page).toEqual({ items: [], total: 73, page: 2, pageSize: 25, pageCount: 3 });
    const listCall = query.mock.calls.find(([options]) => options.query.includes("SELECT *"));
    expect(listCall?.[0].query).toContain("status IN {statuses:Array(String)}");
    expect(listCall?.[0].query).toContain("model IN {models:Array(String)}");
    expect(listCall?.[0].query).toContain("hasAny(tags, {tags:Array(String)})");
    expect(listCall?.[0].query).toContain("total_cost >= {minTotalCost:Float64}");
    expect(listCall?.[0].query).toContain("user_id = {exactUserId:String}");
    expect(listCall?.[0].query).toContain("total_cost ASC");
    expect(listCall?.[0].query_params).toMatchObject({ pageSize: 25, offset: 25 });
  });

  it("excludes each facet's own selection while retaining the other filters", async () => {
    const query = vi.fn(async (_options: QueryOptions) => ({ json: async () => [] }));
    const client = clickHouseClient({ query });

    await listTraceFacets(client, "11111111-1111-4111-8111-111111111111", {
      statuses: ["error"],
      models: ["gpt-4.1"],
    });

    const calls = query.mock.calls.map(([options]) => options);
    const statusCall = calls.find((options) => options.query.includes("GROUP BY status"));
    const modelCall = calls.find((options) => options.query.includes("GROUP BY model"));
    expect(statusCall?.query).not.toContain("status IN");
    expect(statusCall?.query).toContain("model IN {models:Array(String)}");
    expect(modelCall?.query).toContain("status IN {statuses:Array(String)}");
    expect(modelCall?.query).not.toContain("model IN");
  });
});
