/** Synthetic-only benchmark: creates and drops its own database, never touches existing tables. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createClient, type ClickHouseClient, type ClickHouseSettings } from "@clickhouse/client";
import {
  compareEvaluationRunAggregates,
  compareEvaluationRuns,
  getEvaluationRunDetail,
} from "../src/evaluation-run-store.js";

const url = process.env.CLICKHOUSE_URL;
if (!url) throw new Error("Set CLICKHOUSE_URL to an isolated test ClickHouse instance");
const connection = {
  url,
  username: process.env.CLICKHOUSE_USERNAME ?? "lens",
  password: process.env.CLICKHOUSE_PASSWORD ?? "lens",
};
const admin = createClient(connection);
const database = `lens_evaluation_benchmark_${randomUUID().replaceAll("-", "")}`;
const projectId = randomUUID();
const profiles: Array<[string, ClickHouseSettings]> = [
  ["standard", {}],
  [
    "constrained",
    {
      max_threads: 2,
      max_memory_usage: "402653184",
      max_bytes_before_external_group_by: "201326592",
      max_bytes_before_external_sort: "201326592",
    },
  ],
];
await admin.command({ query: `CREATE DATABASE ${database}` });
const setup = createClient({ ...connection, database });
try {
  const folder = new URL("../migrations/clickhouse/", import.meta.url);
  for (const filename of (await readdir(folder)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(filename, folder), "utf8");
    for (const statement of sql
      .split(/;\s*(?:\n|$)/)
      .map((value) => value.trim())
      .filter(Boolean)) {
      await setup.command({ query: statement });
    }
  }
  for (const size of [10_000, 100_000]) {
    for (const role of ["candidate", "baseline"]) {
      const runId = `${role}-${size}`;
      await setup.command({
        query: `INSERT INTO evaluation_runs
        (project_id, id, status, suite_name, started_at, case_count, metric_names, service_name, environment, metadata, expires_at, ingested_at, ingest_version, state_version)
        SELECT {projectId:UUID}, {runId:String}, 'completed', 'benchmark', now64(3), {size:UInt32}, ['quality'], 'synthetic', 'test', '{}', now64(3) + INTERVAL 1 DAY, now64(3), 1, 2`,
        query_params: { projectId, runId, size },
      });
      await setup.command({
        query: `INSERT INTO evaluation_results
        (project_id, id, run_id, timestamp, suite_name, case_id, metric_name, outcome, numeric_value, service_name, environment, metadata, payload, payload_status, expires_at, ingested_at, ingest_version)
        SELECT {projectId:UUID}, concat({runId:String}, '-', toString(number)), {runId:String}, now64(3), 'benchmark', toString(number), 'quality',
          if({role:String} = 'candidate' AND number % 2 = 0, 'fail', 'pass'), if({role:String} = 'candidate' AND number % 2 = 0, 0, 1),
          'synthetic', 'test', '{}', concat('{"input":"', repeat('x', 1024), '"}'), 'captured', now64(3) + INTERVAL 1 DAY, now64(3), 1
        FROM numbers({size:UInt64})`,
        query_params: { projectId, runId, role, size },
      });
    }
    for (const [profile, settings] of profiles) {
      const client = createClient({ ...connection, database, clickhouse_settings: settings });
      try {
        for (const operation of ["detail", "comparison", "gate"] as const) {
          let queries = 0;
          let active = 0;
          let peakQueries = 0;
          let peakRss = process.memoryUsage().rss;
          const rssBefore = peakRss;
          const queryIds: string[] = [];
          const originalQuery = client.query.bind(client);
          const measured = new Proxy(client, {
            get(target, property) {
              if (property !== "query") return Reflect.get(target, property);
              return async (params: Parameters<ClickHouseClient["query"]>[0]) => {
                queries += 1;
                active += 1;
                peakQueries = Math.max(active, peakQueries);
                const queryId = randomUUID();
                queryIds.push(queryId);
                try {
                  return await originalQuery({ ...params, query_id: queryId });
                } finally {
                  active -= 1;
                  peakRss = Math.max(peakRss, process.memoryUsage().rss);
                }
              };
            },
          });
          const sampler = setInterval(() => {
            peakRss = Math.max(peakRss, process.memoryUsage().rss);
          }, 5);
          const started = performance.now();
          const result =
            operation === "detail"
              ? await getEvaluationRunDetail(measured, projectId, `candidate-${size}`)
              : operation === "comparison"
                ? await compareEvaluationRuns(
                    measured,
                    projectId,
                    `candidate-${size}`,
                    `baseline-${size}`,
                  )
                : await compareEvaluationRunAggregates(
                    measured,
                    projectId,
                    `candidate-${size}`,
                    `baseline-${size}`,
                  );
          clearInterval(sampler);
          assert(result);
          if ("caseChanges" in result) {
            assert.equal(result.caseChangeCounts.regressed, size / 2);
            assert.equal(result.caseChanges.length, 100);
            assert.equal(result.caseChangesTruncated, true);
          } else if ("results" in result) {
            assert.equal(result.results.length, 100);
            assert.equal(result.run.results, size);
          }
          const latencyMs = performance.now() - started;
          await setup.command({ query: "SYSTEM FLUSH LOGS" });
          const memory = await setup.query({
            query: `SELECT max(memory_usage) AS bytes FROM system.query_log WHERE query_id IN {ids:Array(String)} AND type = 'QueryFinish'`,
            query_params: { ids: queryIds },
            format: "JSONEachRow",
          });
          const serverMemory = (await memory.json<{ bytes: string }>())[0]?.bytes;
          console.log(
            JSON.stringify({
              size,
              profile,
              operation,
              queries,
              peakQueries,
              latencyMs: Math.round(latencyMs),
              peakRss,
              rssGrowthBytes: peakRss - rssBefore,
              maxQueryMemoryBytes: Number(serverMemory),
            }),
          );
        }
        const controller = new AbortController();
        let cancelledAt = 0;
        let cancelTimer: ReturnType<typeof setTimeout> | undefined;
        const originalQuery = client.query.bind(client);
        const cancellable = new Proxy(client, {
          get(target, property) {
            if (property !== "query") return Reflect.get(target, property);
            return (params: Parameters<ClickHouseClient["query"]>[0]) => {
              if (params.query.includes("WITH per_run AS")) {
                cancelTimer = setTimeout(() => {
                  cancelledAt = performance.now();
                  controller.abort();
                }, 5);
              }
              return originalQuery(params);
            };
          },
        });
        try {
          await assert.rejects(
            compareEvaluationRuns(cancellable, projectId, `candidate-${size}`, `baseline-${size}`, {
              signal: controller.signal,
            }),
          );
          assert(cancelledAt > 0);
          console.log(
            JSON.stringify({
              size,
              profile,
              operation: "cancel-in-flight-case-query",
              latencyMs: Math.round(performance.now() - cancelledAt),
              rejected: true,
            }),
          );
        } finally {
          clearTimeout(cancelTimer);
        }
      } finally {
        await client.close();
      }
    }
  }
} finally {
  await setup.close();
  await admin.command({ query: `DROP DATABASE ${database} SYNC` });
  await admin.close();
}
