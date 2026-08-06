import { Hono } from "hono";
import type { IngestionMetrics } from "../../utils/metrics.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { liveStatus, readyStatus, unavailableStatus } from "./schema.js";

export const createSystemRouter = (deps: ApiDependencies, metrics: IngestionMetrics) =>
  new Hono<AppEnv>()
    .get("/health/live", (c) => c.json(liveStatus))
    .get("/health/ready", async (c) => {
      try {
        await Promise.all([deps.postgres.sql`SELECT 1`, deps.redis.ping(), deps.clickhouse.ping()]);
        return c.json(readyStatus);
      } catch {
        return c.json(unavailableStatus, 503);
      }
    })
    .get("/internal/metrics", async (c) => {
      c.header("Content-Type", metrics.registry.contentType);
      return c.body(await metrics.registry.metrics());
    });
