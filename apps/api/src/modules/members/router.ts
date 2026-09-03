import { invitation, member, user } from "@lens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { appMembership, canManage } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { memberRoleSchema } from "./schema.js";

export const createMembersRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const session = requiredSession(c);
      const app = await appMembership(deps.postgres.db, session.user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");

      const members = await deps.postgres.db
        .select({
          id: member.id,
          userId: member.userId,
          name: user.name,
          email: user.email,
          image: user.image,
          role: member.role,
          createdAt: member.createdAt,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, app.organization.id));
      const invitations = canManage(app.membership.role)
        ? await deps.postgres.db
            .select({
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              status: invitation.status,
              expiresAt: invitation.expiresAt,
              createdAt: invitation.createdAt,
            })
            .from(invitation)
            .where(eq(invitation.organizationId, app.organization.id))
        : [];

      return c.json({
        organizationId: app.organization.id,
        role: app.membership.role,
        canManage: canManage(app.membership.role),
        members: members.map((row) => ({
          ...row,
          isCurrentUser: row.userId === session.user.id,
          createdAt: row.createdAt.toISOString(),
        })),
        invitations: invitations.map((row) => ({
          ...row,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        })),
      });
    })
    .patch(
      "/:memberId",
      jsonInput(memberRoleSchema, "invalid_role", "Role must be admin or member"),
      async (c) => {
        const session = requiredSession(c);
        const app = await appMembership(deps.postgres.db, session.user.id);
        if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
        if (!canManage(app.membership.role)) {
          return apiError(c, 403, "forbidden", "Admin access is required");
        }
        const { role } = c.req.valid("json");
        const [target] = await deps.postgres.db
          .select()
          .from(member)
          .where(
            and(
              eq(member.id, c.req.param("memberId")),
              eq(member.organizationId, app.organization.id),
            ),
          )
          .limit(1);
        if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
        if (target.role === "owner") {
          return apiError(c, 403, "owner_protected", "The owner role cannot be changed");
        }
        const [updated] = await deps.postgres.db
          .update(member)
          .set({ role })
          .where(eq(member.id, target.id))
          .returning();
        return c.json({ id: updated?.id, role: updated?.role });
      },
    )
    .delete("/:memberId", async (c) => {
      const session = requiredSession(c);
      const app = await appMembership(deps.postgres.db, session.user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      if (!canManage(app.membership.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const [target] = await deps.postgres.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, c.req.param("memberId")),
            eq(member.organizationId, app.organization.id),
          ),
        )
        .limit(1);
      if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
      if (target.role === "owner") {
        return apiError(c, 403, "owner_protected", "The owner cannot be removed");
      }
      if (target.userId === session.user.id) {
        return apiError(c, 403, "self_removal", "The current user cannot remove themselves");
      }
      await deps.postgres.db.delete(member).where(eq(member.id, target.id));
      return c.body(null, 204);
    });
