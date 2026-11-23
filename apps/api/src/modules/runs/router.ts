import { listRunFacets, listRuns } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, queryInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { runQuerySchema } from "./schema.js";

export const createRunsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/runs", queryInput(runQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      const page = await listRuns(deps.clickhouse, projectId, {
        ...parsed.filters,
        page: parsed.page,
        pageSize: parsed.pageSize,
        sort: parsed.sort,
        order: parsed.order,
      });
      return c.json(page);
    })
    .get("/:projectId/runs/facets", queryInput(runQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listRunFacets(deps.clickhouse, projectId, parsed.filters));
    });
