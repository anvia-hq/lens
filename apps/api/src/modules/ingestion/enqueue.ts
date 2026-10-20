import type { QueueJobMap } from "@lens/contracts";
import type { LensQueues } from "@lens/queue";

type IngestQueueKey = "evaluations" | "ingest";

/**
 * Matches the error BullMQ's `reprocessJob` script raises when the job is no
 * longer in the expected set (ErrorCode.JobNotInState, -3): two concurrent
 * re-sends can both observe `isFailed() === true`, the first `retry()` wins,
 * and the loser throws `Job <id> is not in the failed state. reprocessJob`.
 * Kept narrow (numeric code plus the exact message shape) so genuine Redis or
 * connection failures still propagate to the router's 503 path.
 */
function isJobNotInFailedStateError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ((error as { code?: unknown }).code === -3) {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes("is not in the failed state");
}

/**
 * Enqueues an ingestion batch whose content hash (jobId) may already exist on
 * the queue. BullMQ ignores `add` when the jobId key still exists, and failed
 * ingest jobs are retained for 7 days, so a re-send after a transient
 * ClickHouse/Postgres failure would otherwise return HTTP 200 while queueing
 * nothing. When the existing job already failed, retry it in place so the
 * payload is processed again; when it is still pending, active, delayed, or
 * already completed, the first submission owns the outcome and the re-send is
 * a harmless duplicate.
 */
export async function enqueueIngestJob<Key extends IngestQueueKey>(
  queue: LensQueues[Key],
  name: keyof QueueJobMap[Key] & string,
  data: QueueJobMap[Key][keyof QueueJobMap[Key] & string],
  jobId: string,
): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (existing !== undefined) {
    if (await existing.isFailed()) {
      // A concurrent re-send may retry the job first; when the job has
      // already left the failed set, the batch is queued by the winner, so
      // treat the loser as success. `retry` resets attemptsMade so the
      // re-run gets the full backoff/retry budget again.
      try {
        await existing.retry("failed", { resetAttemptsMade: true });
      } catch (error) {
        if (!isJobNotInFailedStateError(error)) {
          throw error;
        }
        const current = await queue.getJob(jobId);
        if (current !== undefined && (await current.isFailed())) {
          throw error;
        }
      }
    }
    return;
  }
  const add = queue.add as unknown as (
    name: string,
    data: unknown,
    options: { jobId: string },
  ) => Promise<unknown>;
  await add(name, data, { jobId });
}
