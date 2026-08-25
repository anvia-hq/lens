import { describe, expect, it, vi } from "vitest";
import { getSpan, getTrace, getTraceSummary } from "../src/telemetry-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const traceId = "a".repeat(32);
const spanId = "1".repeat(16);

describe("trace detail reads", () => {
  it("loads and maps a full span on demand", async () => {
    const query = vi.fn(async () => ({ json: async () => [spanRow()] }));

    const span = await getSpan(clickHouseClient({ query }), projectId, traceId, spanId);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ query_params: { projectId, spanId, traceId } }),
    );
    expect(span).toMatchObject({
      cachedInputTokens: 2,
      input: { prompt: "hello" },
      output: "not-json",
      parentSpanId: null,
      resourceAttributes: { service: "agent" },
      spanAttributes: {},
      spanId,
      totalCost: 0.04,
      traceId,
    });
    expect(span?.events).toEqual([{ name: "done" }]);
    expect(span?.links).toEqual([]);
  });

  it("returns undefined when a span does not exist", async () => {
    const query = vi.fn(async () => ({ json: async () => [] }));

    await expect(getSpan(clickHouseClient({ query }), projectId, traceId, spanId)).resolves.toBe(
      undefined,
    );
  });

  it("projects payload columns out of operational span reads", async () => {
    const query = vi.fn(async () => ({ json: async () => [spanRow()] }));

    await getSpan(clickHouseClient({ query }), projectId, traceId, spanId, {
      includePayloads: false,
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("'{}' AS resource_attributes"),
      }),
    );
  });

  it("applies span and evaluation payload limits at the query boundary", async () => {
    const query = vi.fn(async ({ query: sql }: { query: string }) => ({
      json: async () => {
        if (sql.includes("trace_summaries")) return [summaryRow()];
        if (sql.includes("count() AS total")) return [{ total: 0 }];
        return [];
      },
    }));

    await getTrace(clickHouseClient({ query }), projectId, traceId, {
      spanLimit: 500,
      includeEvaluationPayloads: false,
    });

    const requests = query.mock.calls.map(
      ([request]) => request as { query: string; query_params: unknown },
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        query: expect.stringContaining("LIMIT {spanLimit:UInt16}"),
        query_params: { projectId, traceId, spanLimit: 500 },
      }),
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        query: expect.stringContaining("CAST(NULL, 'Nullable(String)') AS payload"),
      }),
    );
  });

  it("loads a trace summary without reading spans", async () => {
    const query = vi.fn(async () => ({ json: async () => [summaryRow()] }));

    const summary = await getTraceSummary(clickHouseClient({ query }), projectId, traceId);

    expect(query).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      projectId,
      spanCount: 1,
      status: "ok",
      totalTokens: 13,
      traceId,
    });
  });

  it("returns undefined when a trace summary does not exist", async () => {
    const query = vi.fn(async () => ({ json: async () => [] }));

    await expect(getTraceSummary(clickHouseClient({ query }), projectId, traceId)).resolves.toBe(
      undefined,
    );
  });
});

function spanRow() {
  return {
    project_id: projectId,
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: "",
    trace_state: "",
    name: "agent.run",
    kind: 1,
    observation_kind: "agent",
    status: "ok",
    status_message: "",
    start_time: "2026-08-20 08:00:00.000000000",
    end_time: "2026-08-20 08:00:01.000000000",
    duration_nano: "1000000000",
    service_name: "agent",
    scope_name: "test",
    scope_version: "1",
    resource_attributes: '{"service":"agent"}',
    span_attributes: "[]",
    events: '[{"name":"done"}]',
    links: "{}",
    trace_name: "Agent run",
    user_id: "user-1",
    session_id: "session-1",
    tags: ["release"],
    version: "1",
    environment: "production",
    release: "0.7.2",
    service_version: "0.7.2",
    model: "model-1",
    input_tokens: "5",
    cached_input_tokens: "2",
    output_tokens: "8",
    total_tokens: "13",
    input_cost: "0.01",
    output_cost: "0.03",
    total_cost: "0.04",
    input: '{"prompt":"hello"}',
    output: "not-json",
    ingested_at: "2026-08-20 08:00:02.000",
    ingest_version: "1",
  };
}

function summaryRow() {
  return {
    project_id: projectId,
    trace_id: traceId,
    name: "Agent run",
    service_name: "agent",
    status: "ok",
    started_at: "2026-08-20 08:00:00.000",
    ended_at: "2026-08-20 08:00:01.000",
    duration_ms: "1000",
    span_count: "1",
    generation_count: "0",
    tool_count: "0",
    error_count: "0",
    user_id: "user-1",
    session_id: "session-1",
    tags: ["release"],
    model: "model-1",
    environment: "production",
    release: "0.7.2",
    version: "1",
    service_version: "0.7.2",
    input_tokens: "5",
    output_tokens: "8",
    total_tokens: "13",
    input_cost: "0.01",
    output_cost: "0.03",
    total_cost: "0.04",
    last_seen_at: "2026-08-20 08:00:02.000",
  };
}
