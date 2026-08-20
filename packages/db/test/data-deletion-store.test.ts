import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { deleteTelemetryEntities } from "../src/data-deletion-store.js";

describe("data deletion store", () => {
  it("deletes trace evaluations before telemetry", async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([{ id: "evaluation-1" }]),
    });
    await deleteTelemetryEntities(client(command, query), "project-1", "trace", ["a".repeat(32)]);

    expect(command).toHaveBeenCalledTimes(3);
    expect(queries(command)).toEqual([
      expect.stringContaining("ALTER TABLE evaluation_results DELETE"),
      expect.stringContaining("ALTER TABLE spans DELETE"),
      expect.stringContaining("ALTER TABLE trace_summaries DELETE"),
    ]);
    expect(queries(command).every((query) => query.includes("mutations_sync = 2"))).toBe(true);
  });

  it("uses session trace membership for the safe cascade", async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue([{ trace_id: "a".repeat(32) }]),
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue([{ id: "evaluation-1" }]),
      });
    await deleteTelemetryEntities(client(command, query), "project-1", "session", ["session-1"]);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("session_id IN {sessionIds:Array(String)}"),
      }),
    );
    expect(queries(command)).toEqual([
      expect.stringContaining("ALTER TABLE evaluation_results DELETE"),
      expect.stringContaining("ALTER TABLE spans DELETE"),
      expect.stringContaining("ALTER TABLE trace_summaries DELETE"),
    ]);
  });

  it("deletes run results while leaving trace tables untouched", async () => {
    const command = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue([{ id: "evaluation-1" }]),
    });
    await deleteTelemetryEntities(client(command, query), "project-1", "evaluation_run", ["run-1"]);

    expect(queries(command)).toEqual([
      expect.stringContaining("ALTER TABLE evaluation_results DELETE"),
      expect.stringContaining("ALTER TABLE evaluation_runs DELETE"),
    ]);
  });
});

function client(
  command: ReturnType<typeof vi.fn>,
  query?: ReturnType<typeof vi.fn>,
): ClickHouseClient {
  return { command, query } as unknown as ClickHouseClient;
}

function queries(command: ReturnType<typeof vi.fn>): string[] {
  return command.mock.calls.map(([input]) => String(input.query));
}
