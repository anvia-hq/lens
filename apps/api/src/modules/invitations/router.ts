import { invitation } from "@lens/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { apiError } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { invitationResponse } from "./schema.js";

export const createInvitationsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/:invitationId", async (c) => {
    const [row] = await deps.postgres.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(eq(invitation.id, c.req.param("invitationId")))
      .limit(1);
    if (row === undefined) return apiError(c, 404, "not_found", "Invitation not found");
    return c.json(invitationResponse(row));
  });
