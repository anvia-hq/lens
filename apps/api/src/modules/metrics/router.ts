import { queryMetrics } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { metricsRangeSchema } from "./schema.js";

export const createMetricsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/:projectId/metrics", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const range = metricsRangeSchema.safeParse(c.req.query("range") ?? "24h");
    if (!range.success) {
      return apiError(c, 400, "invalid_range", "Range must be one of 24h, 7d, or 30d");
    }
    return c.json(await queryMetrics(deps.clickhouse, projectId, range.data));
  });
