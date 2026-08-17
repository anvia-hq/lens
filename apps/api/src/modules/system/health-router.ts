import { Hono } from "hono";
import { appMembership, canManage } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { collectSystemHealth } from "./health.js";

export const createSystemHealthRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/health", async (c) => {
    const membership = await appMembership(deps.postgres.db, requiredSession(c).user.id);
    if (membership === undefined) {
      return apiError(c, 403, "forbidden", "Membership is required");
    }
    if (!canManage(membership.membership.role)) {
      return apiError(c, 403, "forbidden", "Admin access is required");
    }
    c.header("Cache-Control", "no-store");
    return c.json(await collectSystemHealth(deps));
  });
