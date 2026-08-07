import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { getEvaluationDatasetDetail } from "../src/evaluation-dataset-store.js";

type QueryOptions = { query: string; query_params?: Record<string, unknown> };
const projectId = "11111111-1111-4111-8111-111111111111";

describe("evaluation dataset catalog", () => {
  it("marks changed case definitions as conflicts while preserving the first snapshot", async () => {
    const detail = await getEvaluationDatasetDetail(
      fakeClient({ secondInput: "changed question", secondOutput: "different answer" }),
      projectId,
      "support-cases",
      "v1",
    );

    expect(detail?.selectedVersion).toMatchObject({
      version: "v1",
      status: "conflict",
      canonicalRunId: "run-1",
    });
    expect(detail?.cases[0]).toMatchObject({
      caseId: "case-1",
      payload: { input: "question", expected: "answer", output: "first answer" },
      conflict: true,
    });
  });

  it("does not treat changed target output as a dataset-version conflict", async () => {
    const detail = await getEvaluationDatasetDetail(
      fakeClient({ secondInput: "question", secondOutput: "different answer" }),
      projectId,
      "support-cases",
      "v1",
    );

    expect(detail?.selectedVersion.status).toBe("complete");
    expect(detail?.cases[0]?.conflict).toBe(false);
  });
});

function fakeClient(options: { secondInput: string; secondOutput: string }): ClickHouseClient {
  const query = vi.fn(async ({ query: sql, query_params: params }: QueryOptions) => ({
    json: async () => {
      if (sql.includes("SELECT dataset_version AS version")) {
        return [
          {
            version: "v1",
            run_count: "2",
            case_count: "1",
            first_seen_at: "2026-08-07 00:00:00.000",
            last_seen_at: "2026-08-07 00:01:00.000",
          },
        ];
      }
      if (sql.includes("SELECT * FROM evaluation_runs")) return [runRow("run-1"), runRow("run-2")];
      if (sql.includes("SELECT run_id, count() AS results")) {
        return [aggregateRow("run-1"), aggregateRow("run-2")];
      }
      if (sql.includes("SELECT traces.run_id")) return [];
      if (sql.includes("SELECT count() AS total FROM evaluation_results")) return [{ total: "1" }];
      if (sql.includes("SELECT * FROM evaluation_results")) {
        const runId = (params?.runIds as string[] | undefined)?.[0] ?? "run-1";
        return [
          evaluationRow(
            runId,
            runId === "run-1" ? "question" : options.secondInput,
            runId === "run-1" ? "first answer" : options.secondOutput,
          ),
        ];
      }
      return [];
    },
  }));
  return { query } as unknown as ClickHouseClient;
}

function runRow(id: string) {
  const offset = id === "run-1" ? "00:00" : "00:01";
  return {
    project_id: projectId,
    id,
    status: "completed",
    suite_name: "support",
    started_at: `2026-08-07 ${offset}:00.000`,
    completed_at: `2026-08-07 ${offset}:01.000`,
    duration_ms: "1000",
    case_count: "1",
    metric_names: ["quality"],
    passed: "1",
    failed: "0",
    invalid: "0",
    service_name: "test",
    environment: "test",
    release: null,
    dataset_name: "support-cases",
    dataset_version: "v1",
    metadata: "{}",
    expires_at: "2299-12-31 23:59:59.999",
    ingested_at: `2026-08-07 ${offset}:01.000`,
    ingest_version: "1",
    state_version: 2,
  };
}

function aggregateRow(runId: string) {
  return {
    run_id: runId,
    results: "1",
    passed: "1",
    failed: "0",
    invalid: "0",
    unknown: "0",
    evaluated_cases: "1",
    evaluated_traces: "1",
  };
}

function evaluationRow(runId: string, input: string, output: string) {
  return {
    project_id: projectId,
    id: `${runId}-result`,
    run_id: runId,
    timestamp: "2026-08-07 00:00:00.000",
    trace_id: "1234567890abcdef1234567890abcdef",
    observation_id: "1234567890abcdef",
    response_id: null,
    suite_name: "support",
    case_id: "case-1",
    metric_name: "quality",
    outcome: "pass",
    data_type: "BOOLEAN",
    numeric_value: "1",
    categorical_value: null,
    explanation: "Looks good",
    payload: JSON.stringify({ input, expected: "answer", output }),
    payload_status: "captured",
    config_id: null,
    service_name: "test",
    environment: "test",
    release: null,
    metadata: "{}",
    expires_at: "2299-12-31 23:59:59.999",
    ingested_at: "2026-08-07 00:00:00.000",
    ingest_version: "1",
  };
}
