import { randomUUID } from "node:crypto";
import { loadConfig } from "@lens/config";
import type { EvaluationRun } from "@lens/contracts";
import {
  createClickHouse,
  createPostgres,
  deleteTelemetryEntities,
  getTraceExpiration,
  insertSpans,
  organization,
  project,
  reconcileProjectRetention,
} from "@lens/db";
import { createQueues } from "@lens/queue";
import { eq } from "drizzle-orm";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createEvaluationProcessor,
  createIngestTraceProcessor,
  createMaintenanceProcessor,
  createMaterializeTraceProcessor,
  type ProcessorDependencies,
} from "../../src/processors.js";
import { evaluationResult, normalizedSpan } from "../helpers/telemetry.js";

// This suite runs only inside the isolated Compose integration harness. Redis
// holds accepted jobs while processors are deliberately stopped at boundaries.
describe.sequential("project deletion across Postgres, Redis and ClickHouse", () => {
  const config = loadConfig();
  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);
  const queues = createQueues(config.REDIS_URL);
  const organizationId = randomUUID();
  const deps: ProcessorDependencies = {
    postgres,
    clickhouse,
    queues,
    logger: pino({ level: "silent" }),
    materializeDelayMs: 0,
    appUrl: "http://localhost",
  };
  const createdProjects: string[] = [];

  beforeAll(async () => {
    await postgres.db
      .insert(organization)
      .values({ id: organizationId, name: "Deletion test", slug: organizationId });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of createdProjects) {
      await postgres.db.update(project).set({ state: "deleting" }).where(eq(project.id, id));
      await cleanup(id);
    }
    await postgres.db.delete(organization).where(eq(organization.id, organizationId));
    await queues.close();
    await clickhouse.close();
    await postgres.close();
  });

  async function setup() {
    const projectId = randomUUID();
    createdProjects.push(projectId);
    await postgres.db
      .insert(project)
      .values({ id: projectId, organizationId, name: "Deletion test", slug: projectId });
    const now = new Date().toISOString();
    const span = normalizedSpan({
      projectId,
      startTimeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
      endTimeUnixNano: String(BigInt(Date.now() + 1) * 1_000_000n),
      ingestedAt: now,
    });
    const evaluation = {
      ...evaluationResult(),
      projectId,
      runId: "run",
      timestamp: now,
      ingestedAt: now,
    };
    const run: EvaluationRun = {
      projectId,
      id: "run",
      status: "completed",
      suiteName: "test",
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      caseCount: 1,
      metricNames: ["quality"],
      passed: 1,
      failed: 0,
      invalid: 0,
      serviceName: "test",
      environment: "test",
      release: null,
      datasetName: null,
      datasetVersion: null,
      promptName: null,
      promptVersion: null,
      metadata: {},
      expiresAt: null,
      ingestedAt: now,
      ingestVersion: "1",
      stateVersion: 2,
    };
    const traceJob = await queues.ingest.add("ingest", {
      projectId,
      ingestId: randomUUID(),
      receivedAt: now,
      spans: [span],
    });
    const evaluationJob = await queues.evaluations.add("ingest", {
      projectId,
      ingestId: randomUUID(),
      receivedAt: now,
      evaluations: [evaluation],
      runs: [run],
    });
    const materializeJob = await queues.materialize.add("materialize", {
      projectId,
      traceId: span.traceId,
    });
    return { projectId, span, traceJob, evaluationJob, materializeJob };
  }
  async function cleanup(projectId: string) {
    const job = await queues.maintenance.add("delete-project", { projectId });
    await createMaintenanceProcessor(deps)(job);
  }
  async function counts(projectId: string) {
    const result: number[] = [];
    for (const table of ["spans", "trace_summaries", "evaluation_results", "evaluation_runs"]) {
      const rows = await (
        await clickhouse.query({
          query: `SELECT count() AS count FROM ${table} FINAL WHERE project_id = {projectId:UUID}`,
          query_params: { projectId },
          format: "JSONEachRow",
        })
      ).json<{ count: number }>();
      result.push(Number(rows[0]?.count));
    }
    return result;
  }

  it("drops accepted jobs and retries after deletion, including evaluation runs and summaries", async () => {
    const data = await setup();
    await createIngestTraceProcessor(deps)(data.traceJob);
    await createEvaluationProcessor(deps)(data.evaluationJob);
    await createMaterializeTraceProcessor(deps)(data.materializeJob);
    expect(await counts(data.projectId)).toEqual([1, 1, 1, 1]);
    await postgres.db
      .update(project)
      .set({ state: "deleting" })
      .where(eq(project.id, data.projectId));
    // Jobs already persisted in Redis must also skip while the tombstone exists.
    await createIngestTraceProcessor(deps)(data.traceJob);
    await createEvaluationProcessor(deps)(data.evaluationJob);
    await cleanup(data.projectId);
    for (let retry = 0; retry < 2; retry += 1) {
      await createIngestTraceProcessor(deps)(data.traceJob);
      await createEvaluationProcessor(deps)(data.evaluationJob);
      await createMaterializeTraceProcessor(deps)(data.materializeJob);
    }
    expect(await counts(data.projectId)).toEqual([0, 0, 0, 0]);
    expect(await postgres.db.select().from(project).where(eq(project.id, data.projectId))).toEqual(
      [],
    );
  });

  it.each(["trace", "evaluation", "materialize"] as const)(
    "waits for an admitted %s write before committing deletion",
    async (kind) => {
      const data = await setup();
      if (kind === "materialize") await createIngestTraceProcessor(deps)(data.traceJob);
      const entered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      const insert = clickhouse.insert.bind(clickhouse);
      const command = clickhouse.command.bind(clickhouse);
      const spy =
        kind === "materialize"
          ? vi.spyOn(clickhouse, "command").mockImplementationOnce(async (params) => {
              entered.resolve();
              await resume.promise;
              return command(params);
            })
          : vi.spyOn(clickhouse, "insert").mockImplementationOnce(async (params) => {
              entered.resolve();
              await resume.promise;
              return insert(params);
            });
      const write =
        kind === "trace"
          ? createIngestTraceProcessor(deps)(data.traceJob)
          : kind === "evaluation"
            ? createEvaluationProcessor(deps)(data.evaluationJob)
            : createMaterializeTraceProcessor(deps)(data.materializeJob);
      await entered.promise;
      const deletion = postgres.db
        .update(project)
        .set({ state: "deleting" })
        .where(eq(project.id, data.projectId))
        .execute();
      try {
        // Observe an actual conflicting PostgreSQL lock instead of relying on a sleep.
        await vi.waitFor(async () => {
          const locks =
            await postgres.sql`SELECT 1 FROM pg_locks WHERE relation = 'projects'::regclass AND NOT granted`;
          // Row update waits may use a transactionid lock instead of a relation lock.
          const waiting =
            await postgres.sql`SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'update "projects"%'`;
          expect(locks.length + waiting.length).toBeGreaterThan(0);
        });
        expect(
          (await postgres.db.select().from(project).where(eq(project.id, data.projectId)))[0]
            ?.state,
        ).toBe("active");
      } finally {
        resume.resolve();
        await write;
        await deletion;
        spy.mockRestore();
      }
      await cleanup(data.projectId);
      await createIngestTraceProcessor(deps)(data.traceJob);
      await createEvaluationProcessor(deps)(data.evaluationJob);
      await createMaterializeTraceProcessor(deps)(data.materializeJob);
      expect(await counts(data.projectId)).toEqual([0, 0, 0, 0]);
    },
    15_000,
  );

  it("keeps deletion retryable when a synchronous mutation fails", async () => {
    const data = await setup();
    await createIngestTraceProcessor(deps)(data.traceJob);
    await postgres.db
      .update(project)
      .set({ state: "deleting" })
      .where(eq(project.id, data.projectId));
    vi.spyOn(clickhouse, "command").mockRejectedValueOnce(new Error("mutation unavailable"));
    await expect(cleanup(data.projectId)).rejects.toThrow("mutation unavailable");
    expect(
      (await postgres.db.select().from(project).where(eq(project.id, data.projectId)))[0]?.state,
    ).toBe("deleting");
    vi.restoreAllMocks();
    await cleanup(data.projectId);
    expect(await counts(data.projectId)).toEqual([0, 0, 0, 0]);
  });

  it("documents entity deletion as point-in-time and queued expiration as an acceptance snapshot", async () => {
    const data = await setup();
    await insertSpans(clickhouse, [data.span]);
    await deleteTelemetryEntities(clickhouse, data.projectId, "trace", [data.span.traceId]);
    expect((await counts(data.projectId))[0]).toBe(0);
    await reconcileProjectRetention(clickhouse, data.projectId, 7);
    await createIngestTraceProcessor(deps)(data.traceJob);
    expect((await counts(data.projectId))[0]).toBe(1);
    // Accepted with unlimited retention: a later policy mutation cannot rewrite a
    // row that was not yet present. Project deletion itself is the durable boundary.
    expect(await getTraceExpiration(clickhouse, data.projectId, data.span.traceId)).toBe(
      "2299-12-31T23:59:59.999Z",
    );
  });
});
