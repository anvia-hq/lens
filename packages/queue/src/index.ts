import type {
  DeleteDataJob,
  DeleteProjectTelemetryJob,
  EvaluateAlertsJob,
  IngestEvaluationsJob,
  IngestTraceJob,
  MaterializeTraceJob,
  RecalculateModelCostsJob,
  ReconcileRetentionJob,
  SystemQueueHealth,
} from "@lens/contracts";
import { Queue, type QueueOptions } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";

export const queueNames = {
  ingest: "lens-ingest-traces",
  evaluations: "lens-ingest-evaluations",
  materialize: "lens-materialize-traces",
  maintenance: "lens-telemetry-maintenance",
  costs: "lens-model-costs",
  alerts: "lens-alerts",
} as const;

export type LensQueues = {
  ingest: Queue<IngestTraceJob>;
  evaluations: Queue<IngestEvaluationsJob>;
  materialize: Queue<MaterializeTraceJob>;
  maintenance: Queue<ReconcileRetentionJob | DeleteProjectTelemetryJob | DeleteDataJob>;
  costs: Queue<RecalculateModelCostsJob>;
  alerts: Queue<EvaluateAlertsJob>;
  close: () => Promise<void>;
};

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 10_000 },
  removeOnFail: { age: 7 * 86_400, count: 10_000 },
};

export type QueueRetentionOptions = {
  completedAgeSeconds?: number;
  completedCount?: number;
  failedAgeSeconds?: number;
  failedCount?: number;
};

export function createRedisConnection(redisUrl: string, options: RedisOptions = {}): IORedis {
  return new IORedis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    ...options,
  });
}

export function createQueues(
  redisUrl: string,
  connectionOptions: RedisOptions = {},
  retention: QueueRetentionOptions = {},
): LensQueues {
  const connection = createRedisConnection(redisUrl, connectionOptions);
  const options = {
    connection,
    defaultJobOptions: {
      ...defaultJobOptions,
      removeOnComplete: {
        ...defaultJobOptions.removeOnComplete,
        age: retention.completedAgeSeconds ?? defaultJobOptions.removeOnComplete.age,
        count: retention.completedCount ?? defaultJobOptions.removeOnComplete.count,
      },
      removeOnFail: {
        ...defaultJobOptions.removeOnFail,
        age: retention.failedAgeSeconds ?? defaultJobOptions.removeOnFail.age,
        count: retention.failedCount ?? defaultJobOptions.removeOnFail.count,
      },
    },
  } satisfies QueueOptions;
  const ingest = createQueue<IngestTraceJob>(queueNames.ingest, options);
  const evaluations = createQueue<IngestEvaluationsJob>(queueNames.evaluations, options);
  const materialize = createQueue<MaterializeTraceJob>(queueNames.materialize, options);
  const maintenance = createQueue<
    ReconcileRetentionJob | DeleteProjectTelemetryJob | DeleteDataJob
  >(queueNames.maintenance, options);
  const costs = createQueue<RecalculateModelCostsJob>(queueNames.costs, options);
  const alerts = createQueue<EvaluateAlertsJob>(queueNames.alerts, options);

  return {
    ingest,
    evaluations,
    materialize,
    maintenance,
    costs,
    alerts,
    async close() {
      try {
        await Promise.all([
          ingest.close(),
          evaluations.close(),
          materialize.close(),
          maintenance.close(),
          costs.close(),
          alerts.close(),
        ]);
      } finally {
        connection.disconnect();
      }
    },
  };
}

function createQueue<Data>(name: string, options: QueueOptions): Queue<Data> {
  return new Queue<Data>(name, options);
}

export function materializeJobId(projectId: string, traceId: string): string {
  return `materialize-${projectId}-${traceId}`;
}

const workerHeartbeatPrefix = "lens:worker:heartbeat:";
const heartbeatCleanupTimeoutMs = 1_000;

export function startWorkerHeartbeat(
  redis: IORedis,
  instanceId: string,
  options: { intervalMs?: number; ttlMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 10_000;
  const ttlMs = options.ttlMs ?? 30_000;
  const key = `${workerHeartbeatPrefix}${instanceId}`;
  const beat = () => redis.set(key, new Date().toISOString(), "PX", ttlMs);
  void beat().catch(() => undefined);
  const timer = setInterval(() => void beat().catch(() => undefined), intervalMs);
  timer.unref();
  return {
    async close() {
      clearInterval(timer);
      if (redis.status !== "ready") return;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          redis.del(key).catch(() => 0),
          new Promise<number>((resolve) => {
            timeout = setTimeout(() => resolve(0), heartbeatCleanupTimeoutMs);
            timeout.unref();
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    },
  };
}

export async function listWorkerHeartbeats(redis: IORedis): Promise<string[]> {
  let cursor = "0";
  const keys = new Set<string>();
  do {
    const [next, page] = await redis.scan(
      cursor,
      "MATCH",
      `${workerHeartbeatPrefix}*`,
      "COUNT",
      100,
    );
    cursor = next;
    for (const key of page) {
      if (keys.size >= 1_000) break;
      keys.add(key);
    }
  } while (cursor !== "0" && keys.size < 1_000);
  if (keys.size === 0) return [];
  const values = await redis.mget(...keys);
  return values
    .filter((value): value is string => value !== null && !Number.isNaN(Date.parse(value)))
    .sort((left, right) => right.localeCompare(left));
}

export async function queryQueueHealth(queues: LensQueues): Promise<SystemQueueHealth[]> {
  const entries = [
    ["Trace ingestion", queues.ingest],
    ["Evaluations", queues.evaluations],
    ["Trace materialization", queues.materialize],
    ["Maintenance", queues.maintenance],
    ["Cost recalculation", queues.costs],
    ["Alerts", queues.alerts],
  ] as const;
  return Promise.all(
    entries.map(async ([name, queue]) => {
      const [waiting, active, delayed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
      ]);
      return { name, waiting, active, delayed, failed };
    }),
  );
}
