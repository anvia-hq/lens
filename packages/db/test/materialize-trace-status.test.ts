import { describe, expect, it, vi } from "vitest";
import { materializeTrace } from "../src/telemetry-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const traceId = "a".repeat(32);

describe("trace status materialization", () => {
  it("marks a trace running when a successful child arrives before its root", async () => {
    const insert = await materialize([
      spanRow({
        span_id: "2".repeat(16),
        parent_span_id: "1".repeat(16),
        name: "tool.read_file",
        observation_kind: "tool",
        status: "ok",
      }),
    ]);

    expect(insert).toMatchObject({ status: "running", error_count: 0, span_count: 1 });
  });

  it("marks a trace running when an errored child arrives before its root", async () => {
    const insert = await materialize([
      spanRow({
        span_id: "2".repeat(16),
        parent_span_id: "1".repeat(16),
        name: "tool.read_file",
        observation_kind: "tool",
        status: "error",
      }),
    ]);

    expect(insert).toMatchObject({ status: "running", error_count: 1, span_count: 1 });
  });

  it("replaces running with success when the successful root arrives later", async () => {
    const child = spanRow({
      span_id: "2".repeat(16),
      parent_span_id: "1".repeat(16),
      name: "tool.read_file",
      observation_kind: "tool",
      status: "error",
    });
    const inserts = await rematerialize(
      [child],
      [
        child,
        spanRow({
          span_id: "1".repeat(16),
          status: "ok",
          ingested_at: "2026-08-06 08:00:03.000",
          ingest_version: "1786003203000000000",
        }),
      ],
    );

    expect(inserts[0]).toMatchObject({ status: "running", error_count: 1 });
    expect(inserts[1]).toMatchObject({ status: "ok", error_count: 1, span_count: 2 });
    expect(BigInt(String(inserts[1]?.summary_version))).toBeGreaterThan(
      BigInt(String(inserts[0]?.summary_version)),
    );
  });

  it("replaces running with error when the failed root arrives later", async () => {
    const child = spanRow({
      span_id: "2".repeat(16),
      parent_span_id: "1".repeat(16),
      observation_kind: "tool",
      status: "ok",
    });
    const inserts = await rematerialize(
      [child],
      [
        child,
        spanRow({
          span_id: "1".repeat(16),
          status: "error",
          ingested_at: "2026-08-06 08:00:03.000",
          ingest_version: "1786003203000000000",
        }),
      ],
    );

    expect(inserts[0]).toMatchObject({ status: "running", error_count: 0 });
    expect(inserts[1]).toMatchObject({ status: "error", error_count: 1, span_count: 2 });
    expect(BigInt(String(inserts[1]?.summary_version))).toBeGreaterThan(
      BigInt(String(inserts[0]?.summary_version)),
    );
  });

  it("keeps a successful root status while counting recovered child errors", async () => {
    const insert = await materialize([
      spanRow({ span_id: "1".repeat(16), status: "ok" }),
      spanRow({
        span_id: "2".repeat(16),
        parent_span_id: "1".repeat(16),
        name: "tool.read_file",
        observation_kind: "tool",
        status: "error",
        status_message: "path must be relative",
      }),
      spanRow({
        span_id: "3".repeat(16),
        parent_span_id: "1".repeat(16),
        name: "tool.read_file",
        observation_kind: "tool",
        status: "ok",
      }),
    ]);

    expect(insert).toMatchObject({ status: "ok", error_count: 1, span_count: 3, tool_count: 2 });
  });

  it("keeps a genuine root failure as an error", async () => {
    const insert = await materialize([
      spanRow({ span_id: "1".repeat(16), status: "error", status_message: "agent failed" }),
      spanRow({
        span_id: "2".repeat(16),
        parent_span_id: "1".repeat(16),
        observation_kind: "tool",
        status: "ok",
      }),
    ]);

    expect(insert).toMatchObject({ status: "error", error_count: 1 });
  });
});

async function rematerialize(
  initialRows: Array<Record<string, unknown>>,
  completedRows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  let rows = initialRows;
  const query = vi.fn(async ({ query: sql }: { query: string }) => ({
    json: async () =>
      sql.includes("SELECT * FROM spans") ? rows : [{ expires_at: "2299-12-31 23:59:59.999" }],
  }));
  const insert = vi.fn(async (_options: { values: unknown }) => ({}));
  const client = clickHouseClient({ query, insert });

  await materializeTrace(client, projectId, traceId);
  rows = completedRows;
  await materializeTrace(client, projectId, traceId);

  return insert.mock.calls.map(
    ([options]) => (options.values as Array<Record<string, unknown>>)[0] ?? {},
  );
}

async function materialize(rows: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const query = vi.fn(async ({ query: sql }: { query: string }) => ({
    json: async () =>
      sql.includes("SELECT * FROM spans") ? rows : [{ expires_at: "2299-12-31 23:59:59.999" }],
  }));
  const insert = vi.fn(async (_options: { values: unknown }) => ({}));
  await materializeTrace(clickHouseClient({ query, insert }), projectId, traceId);
  const values = insert.mock.calls[0]?.[0]?.values as Array<Record<string, unknown>> | undefined;
  expect(values).toHaveLength(1);
  return values?.[0] ?? {};
}

function spanRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    project_id: projectId,
    trace_id: traceId,
    span_id: "1".repeat(16),
    parent_span_id: "",
    trace_state: "",
    name: "agent.run",
    kind: 1,
    observation_kind: "agent",
    status: "ok",
    status_message: "",
    start_time: "2026-08-06 08:00:00.000000000",
    end_time: "2026-08-06 08:00:01.000000000",
    duration_nano: "1000000000",
    service_name: "agent",
    scope_name: "test",
    scope_version: "1",
    resource_attributes: "{}",
    span_attributes: "{}",
    events: "[]",
    links: "[]",
    trace_name: null,
    user_id: null,
    session_id: "session-1",
    tags: [],
    version: null,
    environment: "default",
    release: null,
    service_version: null,
    model: null,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_cost: null,
    output_cost: null,
    total_cost: null,
    input: null,
    output: null,
    ingested_at: "2026-08-06 08:00:02.000",
    ingest_version: "1786003202000000000",
    ...overrides,
  };
}
