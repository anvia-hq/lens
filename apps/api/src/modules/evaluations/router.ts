import { zValidator } from "@hono/zod-validator";
import { listEvaluationFacets, listEvaluations, queryEvaluationOverview } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, queryInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { evaluationOverviewQuerySchema, evaluationQuerySchema } from "./schema.js";

export const createEvaluationsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/evaluations", queryInput(evaluationQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
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
    .get("/:projectId/evaluations/facets", queryInput(evaluationQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listEvaluationFacets(deps.clickhouse, projectId, parsed.filters));
    })
    .get(
      "/:projectId/evaluations/overview",
      zValidator("query", evaluationOverviewQuerySchema, (result, c) => {
        if (result.success) return;
        const issue = result.error.issues[0];
        if (issue?.path[0] === "range") {
          return apiError(c, 400, "invalid_range", "Range must be one of 24h, 7d, or 30d");
        }
        return apiError(c, 400, "invalid_query", issue?.message ?? "Invalid query");
      }),
      async (c) => {
        const projectId = c.req.param("projectId");
        const access = await requireProjectAccess(
          deps.postgres.db,
          projectId,
          requiredSession(c).user.id,
        );
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        const parsed = c.req.valid("query");
        return c.json(
          await queryEvaluationOverview(deps.clickhouse, projectId, parsed.range, new Date(), {
            suites: parsed.suites,
            environments: parsed.environments,
            releases: parsed.releases,
          }),
        );
      },
    );
