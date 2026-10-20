import type { QueueJobMap } from "@lens/contracts";
import type { LensQueues } from "@lens/queue";

type IngestQueueKey = "evaluations" | "ingest";

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
      await existing.retry("failed");
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
