import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { listRunResultPage, listRunResults } from "../src/evaluation-run-store.js";
import { queryCaseChanges } from "../src/evaluation-case-query.js";

describe("bounded evaluation queries", () => {
  it.each([10_000, 100_000])(
    "serializes legacy snapshot pages and counts %i results only once",
    async (total) => {
      let active = 0;
      let peak = 0;
      const query = vi.fn(async ({ query: sql }: { query: string }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return { json: async () => (sql.includes("count() AS total") ? [{ total }] : []) };
      });
      await listRunResults({ query } as unknown as ClickHouseClient, "project", "run");
      expect(query).toHaveBeenCalledTimes(total / 100 + 1);
      expect(
        query.mock.calls.filter(([args]) => args.query.includes("count() AS total")),
      ).toHaveLength(1);
      expect(peak).toBe(2);
    },
  );

  it("reads only a requested inspection page and reuses the run summary count", async () => {
    const query = vi.fn(async (_params: unknown) => ({ json: async () => [] }));
    const signal = new AbortController().signal;
    const result = await listRunResultPage(
      { query } as unknown as ClickHouseClient,
      "project",
      "run",
      { page: 500, total: 100_000, signal },
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatchObject({
      abort_signal: signal,
      query_params: { pageSize: 100, offset: 49_900 },
    });
    expect(result).toMatchObject({ total: 100_000, page: 500, pageCount: 1_000 });
  });

  it("keeps full comparison counts and explicitly marks capped inspection output", async () => {
    const query = vi.fn(async () => ({
      json: async () => [
        {
          caseId: "case",
          metricName: "quality",
          classification: "regressed",
          candidateOutcome: "fail",
          baselineOutcome: "pass",
          candidateNumericValue: 0,
          baselineNumericValue: null,
          candidateCategoricalValue: null,
          baselineCategoricalValue: "good",
          candidateTraceId: null,
          baselineTraceId: null,
          regressed: "1000",
          improved: "30",
          new_failure: "20",
          removed: "10",
        },
      ],
    }));
    const result = await queryCaseChanges(
      { query } as unknown as ClickHouseClient,
      "project",
      "candidate",
      "baseline",
    );
    expect(result.caseChangeCounts).toEqual({
      regressed: 1000,
      improved: 30,
      new_failure: 20,
      removed: 10,
    });
    expect(result.caseChangesTruncated).toBe(true);
    expect(result.caseChanges[0]).toMatchObject({ candidateValue: 0, baselineValue: "good" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when no case changed", async () => {
    const query = vi.fn(async () => ({ json: async () => [] }));
    expect(
      await queryCaseChanges(
        { query } as unknown as ClickHouseClient,
        "project",
        "candidate",
        "baseline",
      ),
    ).toEqual({
      caseChanges: [],
      caseChangeCounts: { regressed: 0, improved: 0, new_failure: 0, removed: 0 },
      caseChangesTruncated: false,
    });
  });
});
