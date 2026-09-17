import { type QueueJobMap, queueJobSchemas } from "@lens/contracts";
import {
  type BulkJobOptions,
  type Job,
  type JobSchedulerTemplateOptions,
  type JobsOptions,
  Queue,
  type QueueOptions,
  type RepeatOptions,
} from "bullmq";
import type { RedisOptions } from "ioredis";
import { createRedisConnection } from "./redis.js";

export const queueKeys = [
  "ingest",
  "evaluations",
  "materialize",
  "maintenance",
  "costs",
  "alerts",
  "dispatch",
] as const satisfies ReadonlyArray<keyof QueueJobMap>;
export type QueueKey = (typeof queueKeys)[number];

export const queueDefinitions = {
  ingest: { name: "lens-ingest-traces", displayName: "Trace ingestion" },
  evaluations: { name: "lens-ingest-evaluations", displayName: "Evaluations" },
  materialize: { name: "lens-materialize-traces", displayName: "Trace materialization" },
  maintenance: { name: "lens-telemetry-maintenance", displayName: "Maintenance" },
  costs: { name: "lens-model-costs", displayName: "Cost recalculation" },
  alerts: { name: "lens-alerts", displayName: "Alerts" },
  dispatch: { name: "lens-alert-dispatch", displayName: "Alert dispatch" },
} as const satisfies Record<QueueKey, { name: string; displayName: string }>;

export const queueNames = Object.fromEntries(
  queueKeys.map((key) => [key, queueDefinitions[key].name]),
) as { [Key in QueueKey]: (typeof queueDefinitions)[Key]["name"] };

type JobName<Key extends QueueKey> = keyof QueueJobMap[Key] & string;
type JobPayload<Key extends QueueKey> = QueueJobMap[Key][JobName<Key>];
type BulkJob<Key extends QueueKey> = {
  [Name in JobName<Key>]: {
    name: Name;
    data: QueueJobMap[Key][Name];
    opts?: BulkJobOptions;
  };
}[JobName<Key>];
type ScheduledJob<Key extends QueueKey> = {
  [Name in JobName<Key>]: {
    name: Name;
    data: QueueJobMap[Key][Name];
    opts?: JobSchedulerTemplateOptions;
  };
}[JobName<Key>];

export type LensQueue<Key extends QueueKey> = Omit<
  Queue<JobPayload<Key>>,
  "add" | "addBulk" | "upsertJobScheduler"
> & {
  add<Name extends JobName<Key>>(
    name: Name,
    data: QueueJobMap[Key][Name],
    options?: JobsOptions,
  ): Promise<Job<QueueJobMap[Key][Name], unknown, Name>>;
  addBulk(jobs: BulkJob<Key>[]): Promise<Job<JobPayload<Key>, unknown, JobName<Key>>[]>;
  upsertJobScheduler<Name extends JobName<Key>>(
    schedulerId: string,
    repeatOptions: Omit<RepeatOptions, "key">,
    jobTemplate: {
      name: Name;
      data: QueueJobMap[Key][Name];
      opts?: JobSchedulerTemplateOptions;
    },
  ): Promise<Job<QueueJobMap[Key][Name], unknown, Name>>;
};

type QueueSet = { [Key in QueueKey]: LensQueue<Key> };
export type LensQueues = QueueSet & { close: () => Promise<void> };

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

function validateRetention(retention: QueueRetentionOptions): void {
  for (const [name, value] of Object.entries(retention)) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
}

export function createQueues(
  redisUrl: string,
  connectionOptions: RedisOptions = {},
  retention: QueueRetentionOptions = {},
): LensQueues {
  validateRetention(retention);
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
  const queues: QueueSet = {
    ingest: createQueue("ingest", options),
    evaluations: createQueue("evaluations", options),
    materialize: createQueue("materialize", options),
    maintenance: createQueue("maintenance", options),
    costs: createQueue("costs", options),
    alerts: createQueue("alerts", options),
    dispatch: createQueue("dispatch", options),
  };
  let closePromise: Promise<void> | undefined;

  return {
    ...queues,
    close() {
      closePromise ??= closeQueues(queues).finally(() => connection.disconnect());
      return closePromise;
    },
  };
}

async function closeQueues(queues: QueueSet): Promise<void> {
  const results = await Promise.allSettled(queueKeys.map((key) => queues[key].close()));
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length > 0) throw new AggregateError(errors, "One or more queues failed to close");
}

function createQueue<Key extends QueueKey>(key: Key, options: QueueOptions): LensQueue<Key> {
  const queue = new Queue<JobPayload<Key>>(queueNames[key], options);
  const add = queue.add.bind(queue) as unknown as (
    name: string,
    data: JobPayload<Key>,
    options?: JobsOptions,
  ) => Promise<Job<JobPayload<Key>, unknown, string>>;
  const addBulk = queue.addBulk.bind(queue) as unknown as (
    jobs: BulkJob<Key>[],
  ) => Promise<Job<JobPayload<Key>, unknown, JobName<Key>>[]>;
  const upsertJobScheduler = queue.upsertJobScheduler.bind(queue) as unknown as (
    schedulerId: string,
    repeatOptions: Omit<RepeatOptions, "key">,
    jobTemplate: ScheduledJob<Key>,
  ) => Promise<Job<JobPayload<Key>, unknown, JobName<Key>>>;
  const lensQueue = queue as unknown as LensQueue<Key>;

  lensQueue.add = (async (name: JobName<Key>, data: JobPayload<Key>, jobOptions?: JobsOptions) =>
    add(name, parseJobData(key, name, data), jobOptions)) as LensQueue<Key>["add"];
  lensQueue.addBulk = (async (jobs: BulkJob<Key>[]) =>
    addBulk(
      jobs.map((job) => ({
        ...job,
        data: parseJobData(key, job.name, job.data),
      })),
    )) as LensQueue<Key>["addBulk"];
  lensQueue.upsertJobScheduler = (async (
    schedulerId: string,
    repeatOptions: Omit<RepeatOptions, "key">,
    jobTemplate: ScheduledJob<Key>,
  ) =>
    upsertJobScheduler(schedulerId, repeatOptions, {
      ...jobTemplate,
      data: parseJobData(key, jobTemplate.name, jobTemplate.data),
    })) as LensQueue<Key>["upsertJobScheduler"];

  return lensQueue;
}

function parseJobData<Key extends QueueKey>(
  key: Key,
  name: string,
  data: unknown,
): JobPayload<Key> {
  const schemas = queueJobSchemas[key] as Record<
    string,
    { parse: (input: unknown) => unknown } | undefined
  >;
  const schema = schemas[name];
  if (schema === undefined) throw new Error(`Unknown job name "${name}" for queue "${key}"`);
  return schema.parse(data) as JobPayload<Key>;
}

export function materializeJobId(projectId: string, traceId: string): string {
  return `materialize-${projectId}-${traceId}`;
}
