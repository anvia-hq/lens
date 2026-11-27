import { describe, expect, it, vi } from "vitest";
import { insertEvaluations, listEvaluations } from "../src/evaluation-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

type QueryOptions = {
  query: string;
  query_params?: Record<string, unknown>;
};

describe("evaluation queries", () => {
  it("filters both evaluation rows and their count by run ID", async () => {
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () => (sql.includes("count() AS total") ? [{ total: "0" }] : []),
    }));
    const client = clickHouseClient({ query });

    await listEvaluations(client, "11111111-1111-4111-8111-111111111111", {
      runIds: ["run-1"],
      sources: ["human"],
      pageSize: 100,
    });

    expect(query).toHaveBeenCalledTimes(2);
    for (const [options] of query.mock.calls) {
      expect(options.query).toContain("run_id IN {runIds:Array(String)}");
      expect(options.query).toContain("source IN {sources:Array(String)}");
      expect(options.query_params).toMatchObject({ runIds: ["run-1"], sources: ["human"] });
    }
  });

  it("persists and reads multi-trial and judge metadata columns", async () => {
    const insert = vi.fn(async () => undefined);
    const query = vi.fn(async ({ query: sql }: QueryOptions) => ({
      json: async () =>
        sql.includes("count() AS total")
          ? [{ total: "1" }]
          : [
              {
                project_id: "11111111-1111-4111-8111-111111111111",
                id: "eval-trial-2",
                run_id: "run-1",
                timestamp: "2026-08-07 00:00:00.000",
                trace_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                observation_id: "bbbbbbbbbbbbbbbb",
                response_id: null,
                suite_name: "support",
                case_id: "case-1",
                trial: "2",
                trial_count: "3",
                cached: true,
                metric_name: "faithfulness",
                metric_provider: "openai",
                metric_model: "gpt-4.1",
                outcome: "pass",
                data_type: "NUMERIC",
                numeric_value: "0.95",
                categorical_value: null,
                explanation: "Grounded",
                payload: '{"input":"q","output":"a"}',
                payload_status: "captured",
                config_id: null,
                service_name: "agent",
                environment: "test",
                release: null,
                metadata: "{}",
                source: "telemetry",
                reviewer_id: null,
                reviewer_name: null,
                expires_at: "2299-12-31 23:59:59.999",
                ingested_at: "2026-08-07 00:00:01.000",
                ingest_version: "1",
              },
            ],
    }));
    const client = clickHouseClient({ insert, query });

    await insertEvaluations(client, [
      {
        projectId: "11111111-1111-4111-8111-111111111111",
        id: "eval-trial-2",
        runId: "run-1",
        timestamp: "2026-08-07T00:00:00.000Z",
        traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        observationId: "bbbbbbbbbbbbbbbb",
        responseId: null,
        suiteName: "support",
        caseId: "case-1",
        trial: 2,
        trialCount: 3,
        cached: true,
        metricName: "faithfulness",
        metricProvider: "openai",
        metricModel: "gpt-4.1",
        outcome: "pass",
        dataType: "NUMERIC",
        numericValue: 0.95,
        categoricalValue: null,
        explanation: "Grounded",
        payload: { input: "q", output: "a" },
        payloadStatus: "captured",
        configId: null,
        serviceName: "agent",
        environment: "test",
        release: null,
        metadata: {},
        source: "telemetry",
        reviewer: null,
        expiresAt: null,
        ingestedAt: "2026-08-07T00:00:01.000Z",
        ingestVersion: "1",
      },
    ]);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "evaluation_results",
        values: [
          expect.objectContaining({
            trial: 2,
            trial_count: 3,
            cached: true,
            metric_provider: "openai",
            metric_model: "gpt-4.1",
          }),
        ],
      }),
    );

    const page = await listEvaluations(client, "11111111-1111-4111-8111-111111111111", {
      runIds: ["run-1"],
    });
    expect(page.items[0]).toMatchObject({
      trial: 2,
      trialCount: 3,
      cached: true,
      metricProvider: "openai",
      metricModel: "gpt-4.1",
    });
  });
});
