import { randomUUID } from "node:crypto";
import { loadConfig } from "@lens/config";
import type { MaterializeTraceJob, NormalizedSpan } from "@lens/contracts";
import { createClickHouse, createPostgres, organization, project } from "@lens/db";
import { createQueues, createRedisConnection, type LensQueues } from "@lens/queue";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createIngestTraceProcessor,
  createMaterializeTraceProcessor,
  createMaintenanceProcessor,
  type ProcessorDependencies,
} from "../../src/processors.js";
import { normalizedSpan } from "../helpers/telemetry.js";

// Real Redis transitions and ClickHouse INSERT SELECT; only the completion
// boundary is held so a late insert deterministically follows the first read.
describe.sequential("materialization convergence across workers", () => {
  const config = loadConfig();
  const postgres = createPostgres(config);
  const clickhouse = createClickHouse(config);
  const queues = createQueues(config.REDIS_URL);
  const connection = createRedisConnection(config.REDIS_URL);
  const materialize = new Queue<MaterializeTraceJob>(`materialization-test-${randomUUID()}`, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 500 },
      removeOnComplete: true,
    },
  });
  const deps: ProcessorDependencies = {
    postgres,
    clickhouse,
    queues: { ...queues, materialize } as LensQueues,
    logger: pino({ level: "silent" }),
    materializeDelayMs: 100,
    appUrl: "http://localhost",
  };
  const organizationId = randomUUID();
  const workers: Worker[] = [];
  const releases: Array<() => void> = [];
  const workerErrors: Error[] = [];
  let calls = 0;
  let executing = 0;
  let maxExecuting = 0;

  beforeAll(async () => {
    await postgres.db
      .insert(organization)
      .values({ id: organizationId, name: "Convergence", slug: organizationId });
  });
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    vi.restoreAllMocks();
    await materialize.obliterate({ force: true });
    expect(workerErrors.splice(0)).toEqual([]);
    calls = 0;
    executing = 0;
    maxExecuting = 0;
  });
  afterAll(async () => {
    await postgres.db.delete(project).where(eq(project.organizationId, organizationId));
    await postgres.db.delete(organization).where(eq(organization.id, organizationId));
    await materialize.close();
    connection.disconnect();
    await queues.close();
    await clickhouse.close();
    await postgres.close();
  });

  async function setup() {
    const projectId = randomUUID();
    await postgres.db
      .insert(project)
      .values({ id: projectId, organizationId, name: "Convergence", slug: projectId });
    const span = normalizedSpan({
      projectId,
      traceId: randomUUID().replaceAll("-", ""),
      status: "unset",
      ingestVersion: "1",
      startTimeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
      endTimeUnixNano: String(BigInt(Date.now() + 1) * 1_000_000n),
    });
    return span;
  }
  async function ingest(span: NormalizedSpan) {
    const job = await queues.ingest.add("ingest", {
      projectId: span.projectId,
      ingestId: randomUUID(),
      receivedAt: new Date().toISOString(),
      spans: [span],
    });
    await createIngestTraceProcessor(deps)(job);
  }
  function terminal(span: NormalizedSpan): NormalizedSpan {
    return {
      ...span,
      status: "ok",
      observationKind: "generation",
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
      inputCost: 0.07,
      outputCost: 0.03,
      totalCost: 0.1,
      ingestVersion: "2",
    };
  }
  async function summary(span: NormalizedSpan) {
    return (
      await (
        await clickhouse.query({
          query:
            "SELECT status, input_tokens, output_tokens, total_cost FROM trace_summaries FINAL WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}",
          query_params: { projectId: span.projectId, traceId: span.traceId },
          format: "JSONEachRow",
        })
      ).json<{ status: string; input_tokens: number; output_tokens: number; total_cost: number }>()
    )[0];
  }
  async function converged(span: NormalizedSpan) {
    await vi.waitFor(
      async () => {
        const row = await summary(span);
        expect(row?.status).toBe("ok");
        expect(Number(row?.input_tokens)).toBe(7);
        expect(Number(row?.output_tokens)).toBe(3);
        expect(Number(row?.total_cost)).toBeCloseTo(0.1);
        expect(await materialize.getJobCounts("active", "waiting", "delayed")).toEqual({
          active: 0,
          waiting: 0,
          delayed: 0,
          paused: 0,
        });
      },
      { timeout: 10_000, interval: 30 },
    );
  }
  function holdFirstRead(fail = false) {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    releases.push(resume.resolve);
    const command = clickhouse.command.bind(clickhouse);
    vi.spyOn(clickhouse, "command").mockImplementationOnce(async (params) => {
      const result = await command(params);
      entered.resolve();
      await resume.promise;
      if (fail) throw new Error("controlled materialization failure");
      return result;
    });
    return { entered: entered.promise, release: resume.resolve };
  }
  async function startWorkers() {
    for (let index = 0; index < 2; index += 1) {
      const process = createMaterializeTraceProcessor(deps);
      const worker = new Worker(
        materialize.name,
        async (job) => {
          calls += 1;
          executing += 1;
          maxExecuting = Math.max(maxExecuting, executing);
          try {
            await process(job);
          } finally {
            executing -= 1;
          }
        },
        { connection },
      );
      worker.on("error", (error) => workerErrors.push(error));
      workers.push(worker);
    }
    await Promise.all(workers.map((worker) => worker.waitUntilReady()));
  }

  it("reproduces the stable-job-ID loss on BullMQ 5.81.3 (negative control)", async () => {
    const add = materialize.add.bind(materialize);
    vi.spyOn(materialize, "add").mockImplementation((name, data, options) =>
      add(name, data, {
        ...options,
        deduplication: undefined,
        jobId: `legacy-${data.projectId}-${data.traceId}`,
      }),
    );
    const span = await setup();
    const hold = holdFirstRead();
    await ingest(span);
    await startWorkers();
    await hold.entered;
    await ingest(terminal(span));
    hold.release();
    await vi.waitFor(async () => {
      expect(await materialize.getJobCounts("active", "waiting", "delayed")).toEqual({
        active: 0,
        waiting: 0,
        delayed: 0,
        paused: 0,
      });
    });
    expect(calls).toBe(1);
    expect((await summary(span))?.status).toBe("unset");
    const spans = await (
      await clickhouse.query({
        query: "SELECT status FROM spans FINAL WHERE project_id = {projectId:UUID}",
        query_params: { projectId: span.projectId },
        format: "JSONEachRow",
      })
    ).json<{ status: string }>();
    expect(spans).toEqual([{ status: "ok" }]);
  });

  it("coalesces delayed arrivals into one read", async () => {
    const span = await setup();
    await ingest(span);
    await ingest(terminal(span));
    expect(await materialize.getDelayedCount()).toBe(1);
    await startWorkers();
    await converged(span);
    expect(calls).toBe(1);
  }, 15_000);

  it("retains one follow-up after late inserts while the original job is active", async () => {
    const span = await setup();
    const hold = holdFirstRead();
    await ingest(span);
    await startWorkers();
    await hold.entered;
    expect((await summary(span))?.status).toBe("unset");
    for (let batch = 0; batch < 12; batch += 1) await ingest(terminal(span));
    expect(await materialize.getActiveCount()).toBe(1);
    expect(calls).toBe(1);
    hold.release();
    await converged(span);
    expect(calls).toBe(2);
    expect(maxExecuting).toBe(1);
  }, 15_000);

  it("preserves the follow-up through retry backoff and arrivals during retry delay", async () => {
    const span = await setup();
    const hold = holdFirstRead(true);
    await ingest(span);
    await startWorkers();
    await hold.entered;
    await ingest(terminal(span));
    hold.release();
    await vi.waitFor(async () => expect(await materialize.getDelayedCount()).toBe(1));
    await ingest(terminal(span));
    await converged(span);
    expect(calls).toBe(3);
    expect(maxExecuting).toBe(1);
  }, 15_000);

  it("runs the stored follow-up even when the active job exhausts its retries", async () => {
    const span = await setup();
    const hold = holdFirstRead(true);
    await ingest(span);
    // First call is held; exhaust the original job on its second attempt.
    vi.mocked(clickhouse.command).mockRejectedValueOnce(new Error("exhausted"));
    await startWorkers();
    await hold.entered;
    await ingest(terminal(span));
    hold.release();
    await converged(span);
    expect(await materialize.getFailedCount()).toBe(1);
    expect(calls).toBe(3);
    expect(maxExecuting).toBe(1);
  }, 15_000);

  it("discards the deferred follow-up when the project is deleted", async () => {
    const span = await setup();
    const hold = holdFirstRead();
    await ingest(span);
    await startWorkers();
    await hold.entered;
    await materialize.pause();
    await ingest(terminal(span));
    const deletion = postgres.db
      .update(project)
      .set({ state: "deleting" })
      .where(eq(project.id, span.projectId))
      .execute();
    hold.release();
    await deletion;
    const cleanup = await queues.maintenance.add("delete-project", { projectId: span.projectId });
    await createMaintenanceProcessor(deps)(cleanup);
    await materialize.resume();
    await vi.waitFor(async () => {
      expect(await materialize.getJobCounts("active", "waiting", "delayed")).toEqual({
        active: 0,
        waiting: 0,
        delayed: 0,
        paused: 0,
      });
    });
    expect(calls).toBe(2);
    expect(await summary(span)).toBeUndefined();
  }, 15_000);

  it("schedules again after the previous job has just completed", async () => {
    const span = await setup();
    await ingest(span);
    await startWorkers();
    await vi.waitFor(async () => {
      expect((await summary(span))?.status).toBe("unset");
      expect(await materialize.getActiveCount()).toBe(0);
    });
    await ingest(terminal(span));
    await converged(span);
    expect(calls).toBe(2);
    expect(maxExecuting).toBe(1);
  }, 15_000);
});
