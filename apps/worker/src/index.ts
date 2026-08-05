import { loadConfig } from "@lens/config";
import type {
  DeleteProjectTelemetryJob,
  IngestTraceJob,
  MaterializeTraceJob,
  ReconcileRetentionJob,
} from "@lens/contracts";
import {
  createClickHouse,
  createPostgres,
  deleteProjectTelemetry,
  insertSpans,
  materializeTrace,
  project,
  reconcileProjectRetention,
} from "@lens/db";
import { createQueues, createRedisConnection, materializeJobId, queueNames } from "@lens/queue";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import pino from "pino";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL, name: "lens-worker" });
const clickhouse = createClickHouse(config);
const postgres = createPostgres(config);
const queues = createQueues(config.REDIS_URL);
const ingestConnection = createRedisConnection(config.REDIS_URL);
const materializeConnection = createRedisConnection(config.REDIS_URL);
const maintenanceConnection = createRedisConnection(config.REDIS_URL);

const ingestWorker = new Worker<IngestTraceJob>(
  queueNames.ingest,
  async (job) => {
    await insertSpans(clickhouse, job.data.spans);
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

for (const worker of [ingestWorker, materializeWorker, maintenanceWorker]) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, error }, "queue job failed");
  });
  worker.on("error", (error) => logger.error({ queue: worker.name, error }, "queue error"));
}

logger.info("Lens worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await Promise.all([ingestWorker.close(), materializeWorker.close(), maintenanceWorker.close()]);
  ingestConnection.disconnect();
  materializeConnection.disconnect();
  maintenanceConnection.disconnect();
  await queues.close();
  await clickhouse.close();
  await postgres.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}
