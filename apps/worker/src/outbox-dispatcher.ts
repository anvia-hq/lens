import { jobOutboxEventSchema } from "@lens/contracts";
import {
  claimJobOutbox,
  completeJobOutbox,
  type JobOutboxRow,
  type PostgresConnection,
  retryJobOutbox,
} from "@lens/db";
import type { LensQueues } from "@lens/queue";
import type { Logger } from "pino";

type DispatcherDependencies = {
  postgres: PostgresConnection;
  queues: LensQueues;
  logger: Logger;
};

const batchSize = 50;
const leaseMs = 60_000;
const pollMs = 5_000;

export function createJobOutboxDispatcher(deps: DispatcherDependencies) {
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  let stopped = false;

  const trigger = () => {
    if (stopped || inFlight !== undefined) return;
    inFlight = dispatchJobOutboxBatch(deps)
      .then(() => undefined)
      .catch((error: unknown) => deps.logger.error({ err: error }, "job outbox dispatch failed"))
      .finally(() => {
        inFlight = undefined;
      });
  };

  return {
    start() {
      trigger();
      timer = setInterval(trigger, pollMs);
    },
    async close() {
      stopped = true;
      if (timer !== undefined) clearInterval(timer);
      await inFlight;
    },
  };
}

export async function dispatchJobOutboxBatch(
  deps: DispatcherDependencies,
  now = new Date(),
): Promise<number> {
  const rows = await claimJobOutbox(deps.postgres.db, { batchSize, leaseMs, now });
  for (const row of rows) {
    try {
      await publishJobOutbox(deps.queues, row);
      await completeJobOutbox(deps.postgres.db, row.id);
      deps.logger.info(
        { eventId: row.id, queue: row.queue, name: row.name, attempt: row.attempts },
        "job outbox event published",
      );
    } catch (error) {
      const delayMs = retryDelayMs(row.attempts);
      await retryJobOutbox(deps.postgres.db, row.id, error, delayMs, now);
      deps.logger.warn(
        {
          err: error,
          eventId: row.id,
          queue: row.queue,
          name: row.name,
          attempt: row.attempts,
          retryInMs: delayMs,
        },
        "job outbox publication deferred",
      );
    }
  }
  return rows.length;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}

async function publishJobOutbox(queues: LensQueues, row: JobOutboxRow): Promise<void> {
  const event = jobOutboxEventSchema.parse({
    queue: row.queue,
    name: row.name,
    payload: row.payload,
  });
  const options = { jobId: `outbox-${row.id}` };
  if (event.name === "reconcile-retention") {
    await queues.maintenance.add(event.name, event.payload, options);
    return;
  }
  if (event.name === "delete-project") {
    await queues.maintenance.add(event.name, event.payload, options);
    return;
  }
  await queues.costs.add(event.name, event.payload, options);
}
