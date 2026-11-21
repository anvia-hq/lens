import type { Context } from "hono";
import type IORedis from "ioredis";
import { apiError } from "./http.js";
import type { ApiDependencies, AppEnv } from "./types.js";

export async function withinFixedWindowRateLimit(
  redis: IORedis,
  namespace: "ingestion" | "mcp" | "public_api",
  subjectId: string,
  limit: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `lens:${namespace}:rate:${subjectId}:${bucket}`;
  const result = await redis.multi().incr(key).expire(key, 120).exec();
  const count = Number(result?.[0]?.[1] ?? limit + 1);
  return count <= limit;
}

export async function enforcePublicApiRateLimit(
  c: Context<AppEnv>,
  deps: ApiDependencies,
  projectId: string,
): Promise<Response | undefined> {
  let withinLimit: boolean;
  try {
    withinLimit = await withinFixedWindowRateLimit(
      deps.redis,
      "public_api",
      projectId,
      deps.config.OTLP_RATE_LIMIT_PER_MINUTE,
    );
  } catch (error) {
    deps.logger.warn({ err: error, projectId }, "public API rate limiter unavailable");
    c.header("Retry-After", "5");
    return apiError(c, 503, "service_unavailable", "Public API is temporarily unavailable");
  }
  if (!withinLimit) {
    c.header("Retry-After", "60");
    return apiError(c, 429, "rate_limited", "Project API rate limit exceeded");
  }
  return undefined;
}
