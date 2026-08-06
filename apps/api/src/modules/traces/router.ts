import { getTrace, listTraceFacets, listTraces } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { parseTraceRequest } from "./schema.js";

export const createTracesRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/traces", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseTraceRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      const page = await listTraces(deps.clickhouse, projectId, {
        ...parsed.filters,
        page: parsed.page,
        pageSize: parsed.pageSize,
        sort: parsed.sort,
        order: parsed.order,
      });
      return c.json(page);
    })
    .get("/:projectId/traces/facets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseTraceRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listTraceFacets(deps.clickhouse, projectId, parsed.filters));
    })
    .get("/:projectId/traces/:traceId", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const trace = await getTrace(deps.clickhouse, projectId, c.req.param("traceId"));
      return trace === undefined ? apiError(c, 404, "not_found", "Trace not found") : c.json(trace);
    });
