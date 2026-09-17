import type { SystemQueueHealth } from "@lens/contracts";
import { type LensQueues, queueDefinitions, queueKeys } from "./queues.js";

export async function queryQueueHealth(queues: LensQueues): Promise<SystemQueueHealth[]> {
  return Promise.all(
    queueKeys.map(async (key) => {
      const queue = queues[key];
      const [waiting, active, delayed, failed, oldestWaitingSeconds] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getFailedCount(),
        oldestWaitingAgeSeconds(queue),
      ]);
      return {
        name: queueDefinitions[key].displayName,
        waiting,
        active,
        delayed,
        failed,
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
