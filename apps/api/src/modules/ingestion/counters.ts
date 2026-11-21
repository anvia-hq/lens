import type IORedis from "ioredis";

const rejectedPrefix = "lens:ingest:rejected:";
const counterTtlSeconds = 48 * 3_600;

export const INGESTION_REJECTION_REASONS = [
  "content_type",
  "auth",
  "rate_limit",
  "queue_capacity",
  "queue_unavailable",
  "body_size",
  "decompressed_size",
  "gzip",
  "content_encoding",
  "decode",
  "invalid_span",
] as const;

export type IngestionRejectionReason = (typeof INGESTION_REJECTION_REASONS)[number];

function dayKey(now: Date, dayOffset: number): string {
  const date = new Date(now.getTime() - dayOffset * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function key(now: Date, reason: string, dayOffset: number): string {
  return `${rejectedPrefix}${dayKey(now, dayOffset)}:${reason}`;
}

export async function recordIngestionRejection(
  redis: IORedis,
  reason: IngestionRejectionReason,
  count = 1,
  now = new Date(),
): Promise<void> {
  if (count <= 0) return;
  try {
    const redisKey = key(now, reason, 0);
    await redis.multi().incrby(redisKey, count).expire(redisKey, counterTtlSeconds).exec();
  } catch {
    // Ingestion must not fail because health counters are unavailable.
  }
}

export async function readIngestionRejections(
  redis: IORedis,
  now = new Date(),
): Promise<Array<{ reason: string; count: number }>> {
  const reasons = INGESTION_REJECTION_REASONS;
  const todayKeys = reasons.map((reason) => key(now, reason, 0));
  const yesterdayKeys = reasons.map((reason) => key(now, reason, 1));
  const [today, yesterday] = await Promise.all([
    redis.mget(...todayKeys),
    redis.mget(...yesterdayKeys),
  ]);
  const counters: Array<{ reason: string; count: number }> = [];
  for (const [index, reason] of reasons.entries()) {
    const count = Number(today[index] ?? 0) + Number(yesterday[index] ?? 0);
    if (Number.isFinite(count) && count > 0) counters.push({ reason, count });
  }
  return counters.sort(
    (left, right) => right.count - left.count || left.reason.localeCompare(right.reason),
  );
}
