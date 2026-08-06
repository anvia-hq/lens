import { getSession, listSessionFacets, listSessions } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { parseSessionRequest } from "./schema.js";

export const createSessionsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/sessions", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseSessionRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listSessions(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/sessions/facets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseSessionRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listSessionFacets(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/sessions/:sessionId", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const session = await getSession(deps.clickhouse, projectId, c.req.param("sessionId"));
      return session === undefined
        ? apiError(c, 404, "not_found", "Session not found")
        : c.json(session);
    });
