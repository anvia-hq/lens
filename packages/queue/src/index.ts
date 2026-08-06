import type {
  DeleteProjectTelemetryJob,
  IngestTraceJob,
  MaterializeTraceJob,
  RecalculateModelCostsJob,
  ReconcileRetentionJob,
} from "@lens/contracts";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const queueNames = {
  ingest: "lens-ingest-traces",
  materialize: "lens-materialize-traces",
  maintenance: "lens-telemetry-maintenance",
  costs: "lens-model-costs",
} as const;

export type LensQueues = {
  ingest: Queue<IngestTraceJob>;
  materialize: Queue<MaterializeTraceJob>;
  maintenance: Queue<ReconcileRetentionJob | DeleteProjectTelemetryJob>;
  costs: Queue<RecalculateModelCostsJob>;
  close: () => Promise<void>;
};

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  });
}

export function createQueues(redisUrl: string): LensQueues {
  const connection = createRedisConnection(redisUrl);
  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 1_000 },
    removeOnComplete: { age: 3_600, count: 10_000 },
    removeOnFail: { age: 7 * 86_400, count: 10_000 },
  };
  const ingest = new Queue<IngestTraceJob>(queueNames.ingest, {
    connection,
    defaultJobOptions,
  });
  const materialize = new Queue<MaterializeTraceJob>(queueNames.materialize, {
    connection,
    defaultJobOptions,
  });
  const maintenance = new Queue<ReconcileRetentionJob | DeleteProjectTelemetryJob>(
    queueNames.maintenance,
    { connection, defaultJobOptions },
  );
  const costs = new Queue<RecalculateModelCostsJob>(queueNames.costs, {
    connection,
    defaultJobOptions,
  });

  return {
    ingest,
    materialize,
    maintenance,
    costs,
    async close() {
      await Promise.all([ingest.close(), materialize.close(), maintenance.close(), costs.close()]);
      connection.disconnect();
    },
  };
}

export function materializeJobId(projectId: string, traceId: string): string {
  return `materialize-${projectId}-${traceId}`;
}
