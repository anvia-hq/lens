import { invitation, organization } from "@lens/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, organizationMembership } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { invitationResponse } from "./schema.js";

export const createInvitationsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/:invitationId", async (c) => {
    const session = requiredSession(c);
    const [row] = await deps.postgres.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        organizationId: organization.id,
        organizationName: organization.name,
      })
      .from(invitation)
      .innerJoin(organization, eq(invitation.organizationId, organization.id))
      .where(eq(invitation.id, c.req.param("invitationId")))
      .limit(1);
    if (row === undefined) return apiError(c, 404, "not_found", "Invitation not found");
    if (row.email.toLowerCase() !== session.user.email.toLowerCase()) {
      const membership = await organizationMembership(
        deps.postgres.db,
        row.organizationId,
        session.user.id,
      );
      if (!canManage(membership?.role)) {
        return apiError(c, 403, "forbidden", "This invitation belongs to another user");
      }
    }
    return c.json(invitationResponse(row));
  });
