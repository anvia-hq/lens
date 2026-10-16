import { describe, expect, it, vi } from "vitest";
import { compareEvaluationRunAggregates, listEvaluationRuns } from "../src/evaluation-run-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

type QueryOptions = {
  query: string;
  query_params: Record<string, unknown>;
  abort_signal?: AbortSignal;
};
const projectId = "11111111-1111-4111-8111-111111111111";
const pagination = "LIMIT {pageSize:UInt16} OFFSET {offset:UInt64}";

describe("evaluation run summary query bounds", () => {
  it.each([
    [undefined, "started_at"],
    ["startedAt", "started_at"],
    ["suiteName", "suite_name"],
    ["status", "status"],
    ["release", "release"],
    ["environment", "environment"],
    ["durationMs", "duration_ms"],
  ] as const)("pages %s before aggregating results and traces", async (sort, column) => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () => (sql.includes("count() AS total") ? [{ total: "101" }] : []),
    }));
    const page = await listEvaluationRuns(clickHouseClient({ query }), projectId, {
      ...(sort === undefined ? {} : { sort }),
      order: "asc",
      page: 2,
      pageSize: 25,
      suites: ["support"],
    });
    const sql = query.mock.calls[0]![0].query.replace(/\s+/g, " ");
    const runSelection = sql.slice(0, sql.indexOf(", aggregates AS"));
    expect(runSelection).toContain("suite_name IN {suites:Array(String)}");
    expect(runSelection).toContain(
      `ORDER BY isNull(${column}) ASC, ${column} ASC, started_at DESC, id ASC ${pagination}`,
    );
    expect(sql.match(/LIMIT /g)).toHaveLength(1);
    expect(sql.match(/run_id IN \(SELECT id FROM filtered_runs\)/g)).toHaveLength(2);
    expect(sql).toContain(
      "FROM trace_summaries FINAL PREWHERE project_id = {projectId:UUID} AND trace_id IN (SELECT trace_id FROM trace_ids)",
    );
    expect(query.mock.calls[0]![0].query_params).toEqual({
      projectId,
      suites: ["support"],
      pageSize: 25,
      offset: 25,
    });
    expect(query.mock.calls[1]![0].query).not.toContain("LIMIT");
    expect(page).toEqual({ items: [], total: 101, page: 2, pageSize: 25, pageCount: 5 });
  });

  it.each([
    ["evaluatedCases", "evaluated_cases"],
    ["results", "results"],
    ["passRate", "pass_rate"],
    ["p95LatencyMs", "p95_latency_ms"],
    ["averageTotalTokens", "average_total_tokens"],
    ["traceCoverage", "trace_coverage"],
  ] as const)("preserves global %s ordering before pagination", async (sort, column) => {
    const query = vi.fn(async (_options: QueryOptions) => ({ json: async () => [] }));
    await listEvaluationRuns(clickHouseClient({ query }), projectId, { sort });
    const sql = query.mock.calls[0]![0].query.replace(/\s+/g, " ");
    expect(sql.slice(0, sql.indexOf(", aggregates AS"))).not.toContain("LIMIT");
    expect(sql).toContain(
      `ORDER BY isNull(${column}) ASC, ${column} DESC, started_at DESC, id ASC ${pagination}`,
    );
    expect(sql).toContain(
      "FROM trace_summaries FINAL PREWHERE project_id = {projectId:UUID} AND trace_id IN (SELECT trace_id FROM trace_ids)",
    );
  });

  it("restricts quality-gate hydration to each requested run's traces and project", async () => {
    const signal = new AbortController().signal;
    const query = vi.fn(async ({ query: sql, query_params: params }: QueryOptions) => ({
      json: async () => {
        if (sql.includes("SELECT * FROM evaluation_runs")) return [runRow(params.runId)];
        if (sql.includes("FROM trace_summaries")) {
          return [
            {
              run_id: (params.runIds as string[])[0],
              expected_traces: "2",
              found_traces: "1",
              p95_latency_ms: "10",
              average_total_tokens: "20",
            },
          ];
        }
        return [];
      },
    }));
    const comparison = await compareEvaluationRunAggregates(
      clickHouseClient({ query }),
      projectId,
      "candidate",
      "baseline",
      { signal },
    );
    const operational = query.mock.calls
      .map(([options]) => options)
      .filter(({ query: sql }) => sql.includes("FROM trace_summaries"));
    expect(operational).toHaveLength(2);
    expect(operational.map(({ query_params }) => query_params)).toEqual([
      { projectId, runIds: ["candidate"] },
      { projectId, runIds: ["baseline"] },
    ]);
    for (const options of operational) {
      const sql = options.query.replace(/\s+/g, " ");
      expect(options.abort_signal).toBe(signal);
      expect(sql).toContain(
        "WHERE project_id = {projectId:UUID} AND run_id IN {runIds:Array(String)} AND trace_id IS NOT NULL GROUP BY run_id, trace_id",
      );
      expect(sql).toContain(
        "FROM trace_summaries FINAL PREWHERE project_id = {projectId:UUID} AND trace_id IN (SELECT trace_id FROM traces)",
      );
      expect(sql).toContain("LEFT JOIN");
    }
    expect(comparison?.candidate).toMatchObject({
      id: "candidate",
      traceCoverage: 0.5,
      p95LatencyMs: 10,
      averageTotalTokens: 20,
    });
    expect(comparison?.baseline.id).toBe("baseline");
    expect(comparison?.warnings).toContain("Operational metrics have incomplete trace coverage");
  });
});

function runRow(id: unknown) {
  return {
    project_id: projectId,
    id,
    status: "completed",
    suite_name: "support",
    started_at: "2026-08-07 00:00:00.000",
    completed_at: "2026-08-07 00:00:01.000",
    duration_ms: "1000",
    case_count: "2",
    metric_names: ["quality"],
    passed: "1",
    failed: "1",
    invalid: "0",
    service_name: "test",
    environment: "test",
    release: null,
    dataset_name: null,
    dataset_version: null,
    prompt_name: null,
    prompt_version: null,
    metadata: "{}",
    expires_at: "2299-12-31 23:59:59.999",
    ingested_at: "2026-08-07 00:00:01.000",
    ingest_version: "1",
    state_version: 2,
  };
}
