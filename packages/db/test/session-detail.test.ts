import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { getSession, listSessionFacets, listSessions } from "../src/telemetry-store.js";

type QueryOptions = { query: string; query_params?: Record<string, unknown> };
const projectId = "11111111-1111-4111-8111-111111111111";

describe("session queries", () => {
  it("applies aggregate facets, server sorting, and pagination", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () =>
        sql.includes("count() AS total")
          ? [{ total: "26" }]
          : [sessionRow({ session_status: "error", failed_trace_count: "2" })],
    }));
    const page = await listSessions({ query } as unknown as ClickHouseClient, projectId, {
      statuses: ["error"],
      environments: ["production"],
      minTotalCost: 0.01,
      sort: "totalCost",
      order: "asc",
      page: 2,
      pageSize: 25,
    });

    expect(page).toMatchObject({ total: 26, page: 2, pageSize: 25, pageCount: 2 });
    expect(page.items[0]).toMatchObject({
      sessionId: "session-1",
      status: "error",
      totalCost: 0.03,
      environments: ["production"],
    });
    const listCall = query.mock.calls.find(([options]) => options.query.includes("SELECT * FROM"));
    expect(listCall?.[0].query).toContain("countIf(status = 'error') AS failed_trace_count");
    expect(listCall?.[0].query).toContain("sum(error_count) AS span_error_count");
    expect(listCall?.[0].query).toContain("status IN {statuses:Array(String)}");
    expect(listCall?.[0].query).toContain("hasAny(environments, {environments:Array(String)})");
    expect(listCall?.[0].query).toContain("total_cost ASC");
    expect(listCall?.[0].query_params).toMatchObject({ pageSize: 25, offset: 25 });
  });

  it("excludes each session facet's own selection", async () => {
    const query = vi.fn(async (_options: QueryOptions) => ({
      json: async () => [{ value: "value", count: "2" }],
    }));
    const facets = await listSessionFacets({ query } as unknown as ClickHouseClient, projectId, {
      statuses: ["error"],
      models: ["gpt-4.1"],
    });

    expect(Object.keys(facets)).toEqual([
      "status",
      "user",
      "service",
      "model",
      "environment",
      "tag",
    ]);
    const calls = query.mock.calls.map(([options]) => options.query);
    const statusCall = calls.find((sql) => sql.includes("toString(session_status)"));
    const modelCall = calls.find((sql) => sql.includes("ARRAY JOIN models"));
    expect(statusCall).not.toContain("status IN {statuses:Array(String)}");
    expect(statusCall).toContain("hasAny(models, {models:Array(String)})");
    expect(modelCall).toContain("status IN {statuses:Array(String)}");
    expect(modelCall).not.toContain("hasAny(models, {models:Array(String)})");
  });

  it("returns compact prompt and final-response turns with source spans", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () => {
        if (sql.includes("SELECT count() AS total")) return [{ total: "1" }];
        if (sql.includes("SELECT * FROM trace_summaries")) return [traceRow()];
        if (sql.includes("SELECT trace_id, span_id")) {
          return [
            conversationRow({
              span_id: "root",
              input: JSON.stringify({ prompt: "How can I reset my password?" }),
              output: JSON.stringify({ response: "Open account settings." }),
            }),
            conversationRow({
              span_id: "tool",
              parent_span_id: "root",
              observation_kind: "tool",
              input: JSON.stringify({ query: "password" }),
              output: JSON.stringify({ result: "internal result" }),
            }),
          ];
        }
        return [];
      },
    }));

    const detail = await getSession(
      { query } as unknown as ClickHouseClient,
      projectId,
      "session-1",
    );

    expect(detail?.turns).toEqual([
      expect.objectContaining({
        prompt: expect.objectContaining({
          spanId: "root",
          value: { prompt: "How can I reset my password?" },
        }),
        response: expect.objectContaining({
          spanId: "root",
          value: { response: "Open account settings." },
        }),
      }),
    ]);
    expect(detail?.summary).toMatchObject({
      status: "success",
      services: ["support"],
      environments: ["production"],
      models: ["gpt-4.1"],
      totalCost: 0.03,
    });
    const payloadCall = query.mock.calls.find(([options]) =>
      options.query.includes("SELECT trace_id, span_id"),
    );
    expect(payloadCall?.[0].query).toContain("input IS NOT NULL OR output IS NOT NULL");
  });
});

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId,
    session_id: "session-1",
    user_id: "user-1",
    session_started_at: "2026-08-05 00:00:00.000",
    session_ended_at: "2026-08-05 00:00:03.000",
    duration_ms: "3000",
    trace_count: "2",
    failed_trace_count: "0",
    span_error_count: "0",
    session_status: "success",
    span_count: "3",
    input_tokens: "10",
    output_tokens: "5",
    total_tokens: "15",
    input_cost: "0.01",
    output_cost: "0.02",
    total_cost: "0.03",
    services: ["support"],
    environments: ["production"],
    models: ["gpt-4.1"],
    tags: ["chat"],
    last_seen_at: "2026-08-05 00:00:03.000",
    ...overrides,
  };
}

function traceRow() {
  return {
    project_id: projectId,
    trace_id: "trace-1",
    name: "support turn",
    service_name: "support",
    status: "ok",
    started_at: "2026-08-05 00:00:00.000",
    ended_at: "2026-08-05 00:00:01.000",
    duration_ms: "1000",
    span_count: "2",
    generation_count: "1",
    tool_count: "1",
    error_count: "0",
    user_id: "user-1",
    session_id: "session-1",
    tags: ["chat"],
    model: "gpt-4.1",
    environment: "production",
    release: null,
    version: null,
    service_version: "1.0.0",
    input_tokens: "10",
    output_tokens: "5",
    total_tokens: "15",
    input_cost: "0.01",
    output_cost: "0.02",
    total_cost: "0.03",
    last_seen_at: "2026-08-05 00:00:01.000",
  };
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    trace_id: "trace-1",
    span_id: "root",
    parent_span_id: "",
    name: "agent.run",
    observation_kind: "agent",
    start_time: "2026-08-05 00:00:00.000",
    input: null,
    output: null,
    ...overrides,
  };
}
