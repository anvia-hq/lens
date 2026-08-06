import { getUser, listUsers } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { parseUserFilters, parseUserRequest } from "./schema.js";

export const createUsersRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/users", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseUserRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listUsers(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/users/:userId", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const userId = c.req.param("userId");
      if (userId.length === 0 || userId.length > 256) {
        return apiError(c, 400, "invalid_user_id", "userId must be between 1 and 256 characters");
      }
      const filters = parseUserFilters(c);
      if (typeof filters === "string") return apiError(c, 400, "invalid_query", filters);
      const user = await getUser(deps.clickhouse, projectId, userId, filters);
      return user === undefined ? apiError(c, 404, "not_found", "User not found") : c.json(user);
    });
