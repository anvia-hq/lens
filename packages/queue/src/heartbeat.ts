import type IORedis from "ioredis";

const workerHeartbeatPrefix = "lens:worker:heartbeat:";
const heartbeatCleanupTimeoutMs = 1_000;

type HeartbeatOptions = { intervalMs?: number; ttlMs?: number };

function heartbeatTiming(options: HeartbeatOptions): { intervalMs: number; ttlMs: number } {
  const intervalMs = options.intervalMs ?? 10_000;
  const ttlMs = options.ttlMs ?? 30_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("Heartbeat interval must be a positive safe integer");
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= intervalMs) {
    throw new RangeError("Heartbeat TTL must be a safe integer greater than the interval");
  }
  return { intervalMs, ttlMs };
}

export function startWorkerHeartbeat(
  redis: IORedis,
  instanceId: string,
  options: HeartbeatOptions = {},
) {
  if (instanceId.length === 0) throw new TypeError("Worker instance ID is required");
  const { intervalMs, ttlMs } = heartbeatTiming(options);
  const key = `${workerHeartbeatPrefix}${instanceId}`;
  let closed = false;
  let renewal: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  const beat = () => {
    if (closed || renewal !== undefined) return;
    renewal = redis
      .set(key, new Date().toISOString(), "PX", ttlMs)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        renewal = undefined;
      });
  };
  beat();
  const timer = setInterval(beat, intervalMs);
  timer.unref();

  return {
    close() {
      closePromise ??= (async () => {
        closed = true;
        clearInterval(timer);
        await settleWithin(renewal, heartbeatCleanupTimeoutMs);
        if (redis.status !== "ready") return;
        await settleWithin(
          redis.del(key).catch(() => 0),
          heartbeatCleanupTimeoutMs,
        );
      })();
      return closePromise;
    },
  };
}

async function settleWithin(value: Promise<unknown> | undefined, timeoutMs: number): Promise<void> {
  if (value === undefined) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      value,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
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
