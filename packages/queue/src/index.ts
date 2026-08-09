import type {
  DeleteProjectTelemetryJob,
  EvaluateAlertsJob,
  IngestEvaluationsJob,
  IngestTraceJob,
  MaterializeTraceJob,
  RecalculateModelCostsJob,
  ReconcileRetentionJob,
} from "@lens/contracts";
import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";

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
  maintenance: Queue<ReconcileRetentionJob | DeleteProjectTelemetryJob>;
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

export function createRedisConnection(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  });
}

export function createQueues(redisUrl: string): LensQueues {
  const connection = createRedisConnection(redisUrl);
  const options = { connection, defaultJobOptions } satisfies QueueOptions;
  const ingest = createQueue<IngestTraceJob>(queueNames.ingest, options);
  const evaluations = createQueue<IngestEvaluationsJob>(queueNames.evaluations, options);
  const materialize = createQueue<MaterializeTraceJob>(queueNames.materialize, options);
  const maintenance = createQueue<ReconcileRetentionJob | DeleteProjectTelemetryJob>(
    queueNames.maintenance,
    options,
  );
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
