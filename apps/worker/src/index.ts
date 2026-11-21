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
import { alertDeliveryBackoffStrategy } from "@lens/notifications";
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
  reconcileTerminalJobFailure,
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
  {
    connection: dispatchConnection,
    concurrency: 2,
    settings: { backoffStrategy: alertDeliveryBackoffStrategy },
  },
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
    logger.error(
      {
        err: error,
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        queue: worker.name,
      },
      "queue job failed",
    );
    void reconcileTerminalJobFailure(processorDeps, job, error);
  });
  worker.on("stalled", (jobId) => {
    logger.warn({ jobId, queue: worker.name }, "queue job stalled");
  });
  worker.on("error", (error) => logger.error({ err: error, queue: worker.name }, "queue error"));
}

outboxDispatcher.start();
void queues.alerts
  .upsertJobScheduler(
    "evaluate-alert-rules-every-minute",
    { every: 60_000 },
    { name: "evaluate-alert-rules", data: { schemaVersion: 1 } },
  )
  .catch((error: unknown) => logger.error({ err: error }, "alert scheduler setup failed"));
logger.info("Anvia Lens worker started");

const shutdownTimeoutMs = 25_000;
let shutdownPromise: Promise<void> | undefined;

async function runShutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  // Stop advertising liveness before draining workers so health checks reflect drain immediately.
  const closeTasks = async () => {
    await workerHeartbeat.close().catch((err: unknown) => {
      logger.warn({ err }, "worker heartbeat close failed");
    });
    const stages = await Promise.allSettled([
      outboxDispatcher.close(),
      ingestWorker.close(),
      evaluationWorker.close(),
      materializeWorker.close(),
      maintenanceWorker.close(),
      costsWorker.close(),
      alertsWorker.close(),
      dispatchWorker.close(),
    ]);
    for (const stage of stages) {
      if (stage.status === "rejected") {
        logger.error({ err: stage.reason }, "worker shutdown stage failed");
      }
    }
    ingestConnection.disconnect();
    evaluationConnection.disconnect();
    materializeConnection.disconnect();
    maintenanceConnection.disconnect();
    costsConnection.disconnect();
    alertsConnection.disconnect();
    dispatchConnection.disconnect();
    heartbeatConnection.disconnect();
    const infra = await Promise.allSettled([queues.close(), clickhouse.close(), postgres.close()]);
    for (const result of infra) {
      if (result.status === "rejected") {
        logger.error({ err: result.reason }, "infrastructure close failed");
      }
    }
  };
  await Promise.race([
    closeTasks(),
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.error({ timeoutMs: shutdownTimeoutMs }, "worker shutdown timed out");
        resolve();
      }, shutdownTimeoutMs);
      timer.unref();
    }),
  ]);
}

function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= runShutdown(signal);
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err, signal }, "worker shutdown failed");
        process.exit(1);
      });
  });
}
