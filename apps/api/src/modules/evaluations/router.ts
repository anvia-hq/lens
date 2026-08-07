import { metricsRangeSchema } from "@lens/contracts";
import { listEvaluationFacets, listEvaluations, queryEvaluationOverview } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { parseEvaluationRequest } from "./schema.js";

export const createEvaluationsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/evaluations", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseEvaluationRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(
        await listEvaluations(deps.clickhouse, projectId, {
          ...parsed.filters,
          page: parsed.page,
          pageSize: parsed.pageSize,
          sort: parsed.sort,
          order: parsed.order,
        }),
      );
    })
    .get("/:projectId/evaluations/facets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseEvaluationRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listEvaluationFacets(deps.clickhouse, projectId, parsed.filters));
    })
    .get("/:projectId/evaluations/overview", async (c) => {
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
      return c.json(await queryEvaluationOverview(deps.clickhouse, projectId, range.data));
    });
