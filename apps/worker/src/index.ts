import { loadConfig } from "@lens/config";
import type {
  DeleteProjectTelemetryJob,
  IngestEvaluationsJob,
  IngestTraceJob,
  MaterializeTraceJob,
  RecalculateModelCostsJob,
  ReconcileRetentionJob,
} from "@lens/contracts";
import {
  applyModelPrices,
  costRecalculation,
  createClickHouse,
  createPostgres,
  deleteProjectTelemetry,
  insertEvaluationRuns,
  insertEvaluations,
  insertSpans,
  llmModelPrice,
  materializeTrace,
  project,
  recalculateModelCosts,
  reconcileProjectRetention,
} from "@lens/db";
import { createQueues, createRedisConnection, materializeJobId, queueNames } from "@lens/queue";
import { Worker } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import pino from "pino";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL, name: "lens-worker" });
const clickhouse = createClickHouse(config);
const postgres = createPostgres(config);
const queues = createQueues(config.REDIS_URL);
const ingestConnection = createRedisConnection(config.REDIS_URL);
const materializeConnection = createRedisConnection(config.REDIS_URL);
const evaluationConnection = createRedisConnection(config.REDIS_URL);
const maintenanceConnection = createRedisConnection(config.REDIS_URL);
const costsConnection = createRedisConnection(config.REDIS_URL);

const ingestWorker = new Worker<IngestTraceJob>(
  queueNames.ingest,
  async (job) => {
    const modelNames = Array.from(
      new Set(
        job.data.spans.flatMap((span) =>
          span.model === null ||
          (span.observationKind !== "generation" && span.observationKind !== "embedding")
            ? []
            : [span.model],
        ),
      ),
    );
    const [projectRow] = await postgres.db
      .select({ organizationId: project.organizationId })
      .from(project)
      .where(eq(project.id, job.data.projectId))
      .limit(1);
    const priceRows =
      projectRow === undefined || modelNames.length === 0
        ? []
        : await postgres.db
            .select()
            .from(llmModelPrice)
            .where(
              and(
                eq(llmModelPrice.organizationId, projectRow.organizationId),
                inArray(llmModelPrice.model, modelNames),
              ),
            );
    const spans = applyModelPrices(
      job.data.spans,
      priceRows.map((row) => ({
        model: row.model,
        inputPricePerMillion: Number(row.inputPricePerMillion),
        cachedInputPricePerMillion:
          row.cachedInputPricePerMillion === null ? null : Number(row.cachedInputPricePerMillion),
        outputPricePerMillion: Number(row.outputPricePerMillion),
      })),
    );
    await insertSpans(clickhouse, spans);
    for (const traceId of new Set(job.data.spans.map((span) => span.traceId))) {
      await queues.materialize.add(
        "materialize",
        { projectId: job.data.projectId, traceId },
        {
          delay: 1_500,
          jobId: materializeJobId(job.data.projectId, traceId),
          removeOnComplete: true,
        },
      );
    }
    logger.info({ jobId: job.id, spans: job.data.spans.length }, "ingested trace batch");
  },
  { connection: ingestConnection, concurrency: 8 },
);

const materializeWorker = new Worker<MaterializeTraceJob>(
  queueNames.materialize,
  async (job) => {
    await materializeTrace(clickhouse, job.data.projectId, job.data.traceId);
  },
  { connection: materializeConnection, concurrency: 8 },
);

const evaluationWorker = new Worker<IngestEvaluationsJob>(
  queueNames.evaluations,
  async (job) => {
    const runs = job.data.runs ?? [];
    await Promise.all([
      insertEvaluations(clickhouse, job.data.evaluations),
      insertEvaluationRuns(clickhouse, runs),
    ]);
    logger.info(
      { jobId: job.id, evaluations: job.data.evaluations.length, runs: runs.length },
      "ingested evaluation batch",
    );
  },
  { connection: evaluationConnection, concurrency: 8 },
);

const maintenanceWorker = new Worker<ReconcileRetentionJob | DeleteProjectTelemetryJob>(
  queueNames.maintenance,
  async (job) => {
    if (job.name === "reconcile-retention" && "retentionDays" in job.data) {
      await reconcileProjectRetention(clickhouse, job.data.projectId, job.data.retentionDays);
      return;
    }
    await deleteProjectTelemetry(clickhouse, job.data.projectId);
    await postgres.db.delete(project).where(eq(project.id, job.data.projectId));
  },
  { connection: maintenanceConnection, concurrency: 1 },
);

const costsWorker = new Worker<RecalculateModelCostsJob>(
  queueNames.costs,
  async (job) => {
    const [run] = await postgres.db
      .select()
      .from(costRecalculation)
      .where(eq(costRecalculation.id, job.data.recalculationId))
      .limit(1);
    if (run === undefined || run.status === "completed") return;
    await postgres.db
      .update(costRecalculation)
      .set({ status: "running", startedAt: new Date(), completedAt: null, error: null })
      .where(eq(costRecalculation.id, run.id));
    try {
      const projectRows = await postgres.db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.organizationId, run.organizationId));
      const result = await recalculateModelCosts(clickhouse, {
        projectIds: projectRows.map((row) => row.id),
        prices: run.priceSnapshot,
        from: run.from?.toISOString() ?? null,
        to: run.to?.toISOString() ?? null,
      });
      await postgres.db
        .update(costRecalculation)
        .set({
          status: "completed",
          affectedSpans: String(result.affectedSpans),
          affectedTraces: String(result.affectedTraces),
          completedAt: new Date(),
          error: null,
        })
        .where(eq(costRecalculation.id, run.id));
      logger.info({ jobId: job.id, ...result }, "recalculated model costs");
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await postgres.db
        .update(costRecalculation)
        .set({
          status: finalAttempt ? "failed" : "queued",
          completedAt: finalAttempt ? new Date() : null,
          error: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown worker error",
        })
        .where(eq(costRecalculation.id, run.id));
      throw error;
    }
  },
  { connection: costsConnection, concurrency: 1 },
);

for (const worker of [
  ingestWorker,
  evaluationWorker,
  materializeWorker,
  maintenanceWorker,
  costsWorker,
]) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, error }, "queue job failed");
  });
  worker.on("error", (error) => logger.error({ queue: worker.name, error }, "queue error"));
}

logger.info("Anvia Lens worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await Promise.all([
    ingestWorker.close(),
    evaluationWorker.close(),
    materializeWorker.close(),
    maintenanceWorker.close(),
    costsWorker.close(),
  ]);
  ingestConnection.disconnect();
  evaluationConnection.disconnect();
  materializeConnection.disconnect();
  maintenanceConnection.disconnect();
  costsConnection.disconnect();
  await queues.close();
  await clickhouse.close();
  await postgres.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}
