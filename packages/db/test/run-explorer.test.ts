import { describe, expect, it, vi } from "vitest";
import { listRunFacets, listRuns } from "../src/telemetry-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

type QueryOptions = { query: string; query_params?: Record<string, unknown> };
const projectId = "11111111-1111-4111-8111-111111111111";

describe("run explorer queries", () => {
  it("filters, sorts, paginates, and extracts previews for individual runs", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () =>
        sql.includes("count() AS total")
          ? [{ total: "12" }]
          : [
              {
                project_id: projectId,
                trace_id: "a".repeat(32),
                span_id: "b".repeat(16),
                parent_span_id: "c".repeat(16),
                name: "get_ticket",
                trace_name: "ticket-triage",
                observation_kind: "tool",
                status: "error",
                status_message: "Ticket not found",
                start_time: "2026-08-05 00:00:00.000000000",
                end_time: "2026-08-05 00:00:00.250000000",
                duration_nano: "250000000",
                service_name: "support-agent",
                model: null,
                environment: "production",
                release: "1.2.0",
                version: "v2",
                service_version: "1.2.0",
                user_id: "user-1",
                session_id: "thread-1",
                tags: ["support"],
                input_tokens: "0",
                output_tokens: "0",
                total_tokens: "0",
                input_cost: null,
                output_cost: null,
                total_cost: null,
                input_snippet: JSON.stringify({ id: "TICKET-404" }),
                output_snippet: JSON.stringify({ error: "not_found" }),
              },
            ],
    }));

    const page = await listRuns(clickHouseClient({ query }), projectId, {
      observationKinds: ["tool"],
      statuses: ["error"],
      search: "ticket",
      minDurationMs: 100,
      sort: "durationMs",
      order: "desc",
      page: 1,
      pageSize: 25,
    });

    expect(page).toMatchObject({ total: 12, page: 1, pageSize: 25, pageCount: 1 });
    expect(page.items[0]).toMatchObject({
      spanId: "b".repeat(16),
      traceId: "a".repeat(32),
      name: "get_ticket",
      observationKind: "tool",
      status: "error",
      durationMs: 250,
      inputPreview: '{"id":"TICKET-404"}',
      outputPreview: '{"error":"not_found"}',
    });
    const listCall = query.mock.calls.find(([options]) =>
      options.query.includes("FROM spans FINAL"),
    );
    expect(listCall?.[0].query).toContain("observation_kind IN {observationKinds:Array(String)}");
    expect(listCall?.[0].query).toContain("status IN {statuses:Array(String)}");
    expect(listCall?.[0].query).toContain("(duration_nano / 1000000) >= {minDurationMs:Float64}");
    expect(listCall?.[0].query).toContain("duration_nano DESC");
  });

  it("excludes each facet's own filter when computing run facets", async () => {
    const query = vi.fn(async (_options: QueryOptions) => ({
      json: async () => [{ value: "tool", count: "4" }],
    }));

    const facets = await listRunFacets(clickHouseClient({ query }), projectId, {
      observationKinds: ["tool"],
      statuses: ["error"],
    });

    expect(Object.keys(facets)).toEqual([
      "observationKind",
      "status",
      "service",
      "name",
      "model",
      "environment",
      "release",
      "version",
      "serviceVersion",
      "tag",
    ]);
    const calls = query.mock.calls.map(([options]) => options.query);
    const kindCall = calls.find((sql) => sql.includes("toString(observation_kind)"));
    const statusCall = calls.find((sql) => sql.includes("toString(status)"));
    expect(kindCall).not.toContain("observation_kind IN {observationKinds:Array(String)}");
    expect(kindCall).toContain("status IN {statuses:Array(String)}");
    expect(statusCall).toContain("observation_kind IN {observationKinds:Array(String)}");
    expect(statusCall).not.toContain("status IN {statuses:Array(String)}");
  });
});
