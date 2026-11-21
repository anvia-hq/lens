import type { SystemQueueHealth } from "@lens/contracts";
import { type LensQueues, queueDefinitions, queueKeys } from "./queues.js";

export async function queryQueueHealth(queues: LensQueues): Promise<SystemQueueHealth[]> {
  return Promise.all(
    queueKeys.map(async (key) => {
      const queue = queues[key];
      const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
      const waiting = counts.waiting ?? 0;
      const oldestWaitingSeconds = waiting > 0 ? await oldestWaitingAgeSeconds(queue) : null;
      return {
        name: queueDefinitions[key].displayName,
        waiting,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        oldestWaitingSeconds,
      };
    }),
  );
}

async function oldestWaitingAgeSeconds(queue: {
  getWaiting: (start: number, end: number) => Promise<Array<{ timestamp: number }>>;
}): Promise<number | null> {
  const [job] = await queue.getWaiting(0, 0);
  if (job === undefined) return null;
  return Math.max(0, Math.round((Date.now() - job.timestamp) / 1_000));
}
