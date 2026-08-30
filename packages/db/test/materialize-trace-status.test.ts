import { describe, expect, it, vi } from "vitest";
import { materializeTrace } from "../src/telemetry-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const traceId = "a".repeat(32);

describe("trace status materialization", () => {
  it("aggregates a trace entirely inside ClickHouse", async () => {
    const command = vi.fn(async (_options: { query: string }) => ({}));

    await materializeTrace(clickHouseClient({ command }), projectId, traceId);

    expect(command).toHaveBeenCalledWith({
      query: expect.stringContaining("INSERT INTO trace_summaries"),
      query_params: { projectId, traceId },
    });
    const sql = String(command.mock.calls[0]?.[0]?.query ?? "");
    expect(sql).toContain("FROM spans AS span FINAL");
    expect(sql).toContain("GROUP BY span.project_id, span.trace_id");
    expect(sql).toContain("countIf(span.parent_span_id = '') > 0");
    expect(sql).toContain("'running') AS status");
    expect(sql).toContain("countIf(span.status = 'error')");
    expect(sql).toContain("sumIf(span.input_tokens, span.observation_kind = 'generation')");
    expect(sql).toContain("span.observation_kind IN ('generation', 'embedding')");
  });

  it("does not transfer raw span or payload rows through the worker", async () => {
    const command = vi.fn(async (_options: { query: string }) => ({}));
    const query = vi.fn();
    const insert = vi.fn();

    await materializeTrace(clickHouseClient({ command, insert, query }), projectId, traceId);

    expect(query).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    const sql = String(command.mock.calls[0]?.[0]?.query ?? "");
    for (const column of ["resource_attributes", "span_attributes", "events", "links"]) {
      expect(sql).not.toContain(column);
    }
  });
});
