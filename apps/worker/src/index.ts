import { randomUUID } from "node:crypto";
import { loadConfig } from "@lens/config";
import type {
  DispatchAlertJob,
  EvaluateAlertsJob,
  IngestEvaluationsJob,
  IngestTraceJob,
  MaterializeTraceJob,
} from "@lens/contracts";
import { createClickHouse, createPostgres } from "@lens/db";
import { createQueues, createRedisConnection, queueNames, startWorkerHeartbeat } from "@lens/queue";
import { Worker } from "bullmq";
import pino from "pino";
import { createAlertDispatchProcessor } from "./alert-dispatcher.js";
import { createAlertProcessor } from "./alerts.js";
import { createJobOutboxDispatcher } from "./outbox-dispatcher.js";
import {
  createCostsProcessor,
  createEvaluationProcessor,
  createIngestTraceProcessor,
  createMaintenanceProcessor,
  createMaterializeTraceProcessor,
} from "./processors.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL, name: "lens-worker" });
const clickhouse = createClickHouse(config);
const postgres = createPostgres(config);
const queues = createQueues(
  config.REDIS_URL,
  {},
  {
    completedAgeSeconds: config.QUEUE_RETAIN_COMPLETED_AGE_SECONDS,
    completedCount: config.QUEUE_RETAIN_COMPLETED_COUNT,
    failedAgeSeconds: config.QUEUE_RETAIN_FAILED_AGE_SECONDS,
    failedCount: config.QUEUE_RETAIN_FAILED_COUNT,
  },
);
const ingestConnection = createRedisConnection(config.REDIS_URL);
const materializeConnection = createRedisConnection(config.REDIS_URL);
const evaluationConnection = createRedisConnection(config.REDIS_URL);
const maintenanceConnection = createRedisConnection(config.REDIS_URL);
const costsConnection = createRedisConnection(config.REDIS_URL);
const alertsConnection = createRedisConnection(config.REDIS_URL);
const dispatchConnection = createRedisConnection(config.REDIS_URL);
const heartbeatConnection = createRedisConnection(config.REDIS_URL, {
  commandTimeout: 2_500,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
const workerHeartbeat = startWorkerHeartbeat(
  heartbeatConnection,
  process.env.HOSTNAME || randomUUID(),
);
const processorDeps = {
  clickhouse,
  postgres,
  queues,
  logger,
  materializeDelayMs: config.MATERIALIZE_DELAY_MS,
  appUrl: config.PUBLIC_APP_URL,
};

const ingestWorker = new Worker<IngestTraceJob>(
  queueNames.ingest,
  createIngestTraceProcessor(processorDeps),
  { connection: ingestConnection, concurrency: config.WORKER_INGEST_CONCURRENCY },
);
const materializeWorker = new Worker<MaterializeTraceJob>(
  queueNames.materialize,
  createMaterializeTraceProcessor(processorDeps),
  { connection: materializeConnection, concurrency: config.WORKER_MATERIALIZE_CONCURRENCY },
);
const evaluationWorker = new Worker<IngestEvaluationsJob>(
  queueNames.evaluations,
  createEvaluationProcessor(processorDeps),
  { connection: evaluationConnection, concurrency: config.WORKER_EVALUATION_CONCURRENCY },
);
const maintenanceWorker = new Worker(
  queueNames.maintenance,
  createMaintenanceProcessor(processorDeps),
  {
    connection: maintenanceConnection,
    concurrency: 1,
  },
);
const costsWorker = new Worker(queueNames.costs, createCostsProcessor(processorDeps), {
  connection: costsConnection,
  concurrency: 1,
});
const alertsWorker = new Worker<EvaluateAlertsJob>(
  queueNames.alerts,
  createAlertProcessor(processorDeps),
  { connection: alertsConnection, concurrency: 1 },
);
// HTTP-bound outbound deliveries; a small fixed pool matches the alerts worker.
const dispatchWorker = new Worker<DispatchAlertJob>(
  queueNames.dispatch,
  createAlertDispatchProcessor(processorDeps),
  { connection: dispatchConnection, concurrency: 2 },
);
const outboxDispatcher = createJobOutboxDispatcher({ postgres, queues, logger });

for (const worker of [
  ingestWorker,
  evaluationWorker,
  materializeWorker,
  maintenanceWorker,
  costsWorker,
  alertsWorker,
  dispatchWorker,
]) {
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, queue: worker.name, error }, "queue job failed");
  });
  worker.on("error", (error) => logger.error({ queue: worker.name, error }, "queue error"));
}

outboxDispatcher.start();
void queues.alerts
  .upsertJobScheduler(
    "evaluate-alert-rules-every-minute",
    { every: 60_000 },
    { name: "evaluate-alert-rules", data: {} },
  )
  .catch((error: unknown) => logger.error({ err: error }, "alert scheduler setup failed"));
logger.info("Anvia Lens worker started");

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await outboxDispatcher.close();
  await Promise.all([
    ingestWorker.close(),
    evaluationWorker.close(),
    materializeWorker.close(),
    maintenanceWorker.close(),
    costsWorker.close(),
    alertsWorker.close(),
    dispatchWorker.close(),
  ]);
  await workerHeartbeat.close();
  ingestConnection.disconnect();
  evaluationConnection.disconnect();
  materializeConnection.disconnect();
  maintenanceConnection.disconnect();
  costsConnection.disconnect();
  alertsConnection.disconnect();
  dispatchConnection.disconnect();
  heartbeatConnection.disconnect();
  await queues.close();
  await clickhouse.close();
  await postgres.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}
