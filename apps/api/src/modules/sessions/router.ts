import { getSession, listSessionFacets, listSessions } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, queryInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { sessionDetailQuerySchema, sessionQuerySchema } from "./schema.js";

export const createSessionsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/sessions", queryInput(sessionQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listSessions(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/sessions/facets", queryInput(sessionQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listSessionFacets(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/sessions/:sessionId", queryInput(sessionDetailQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      const session = await getSession(
        deps.clickhouse,
        projectId,
        c.req.param("sessionId"),
        parsed,
      );
      return session === undefined
        ? apiError(c, 404, "not_found", "Session not found")
        : c.json(session);
    });
