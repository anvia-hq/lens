import type IORedis from "ioredis";

export async function withinFixedWindowRateLimit(
  redis: IORedis,
  namespace: "ingestion" | "mcp",
  subjectId: string,
  limit: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `lens:${namespace}:rate:${subjectId}:${bucket}`;
  const result = await redis.multi().incr(key).expire(key, 120).exec();
  const count = Number(result?.[0]?.[1] ?? limit + 1);
  return count <= limit;
}
