import { getUser, listUsers } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, queryInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { userFiltersSchema, userQuerySchema } from "./schema.js";

export const createUsersRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/users", queryInput(userQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listUsers(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/users/:userId", queryInput(userFiltersSchema), async (c) => {
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
      const filters = c.req.valid("query");
      const user = await getUser(deps.clickhouse, projectId, userId, filters);
      return user === undefined ? apiError(c, 404, "not_found", "User not found") : c.json(user);
    });
