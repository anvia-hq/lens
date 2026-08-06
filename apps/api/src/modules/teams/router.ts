import { invitation, member, user } from "@lens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, ensureDefaultTeam } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { parseMemberRole } from "./schema.js";

export const createTeamsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const session = requiredSession(c);
      const team = await ensureDefaultTeam(deps.postgres.db, session.user);

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
        .where(eq(member.organizationId, team.organization.id));
      const invitations = canManage(team.membership.role)
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
            .where(eq(invitation.organizationId, team.organization.id))
        : [];

      return c.json({
        organizationId: team.organization.id,
        role: team.membership.role,
        canManage: canManage(team.membership.role),
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
    .patch("/members/:memberId", async (c) => {
      const session = requiredSession(c);
      const team = await ensureDefaultTeam(deps.postgres.db, session.user);
      if (!canManage(team.membership.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const body = await safeJson(c);
      const role = parseMemberRole(body?.role);
      if (role === undefined) {
        return apiError(c, 400, "invalid_role", "Role must be admin or member");
      }
      const [target] = await deps.postgres.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, c.req.param("memberId")),
            eq(member.organizationId, team.organization.id),
          ),
        )
        .limit(1);
      if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
      if (target.role === "owner") {
        return apiError(c, 403, "owner_protected", "The team owner role cannot be changed");
      }
      const [updated] = await deps.postgres.db
        .update(member)
        .set({ role })
        .where(eq(member.id, target.id))
        .returning();
      return c.json({ id: updated?.id, role: updated?.role });
    })
    .delete("/members/:memberId", async (c) => {
      const session = requiredSession(c);
      const team = await ensureDefaultTeam(deps.postgres.db, session.user);
      if (!canManage(team.membership.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const [target] = await deps.postgres.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, c.req.param("memberId")),
            eq(member.organizationId, team.organization.id),
          ),
        )
        .limit(1);
      if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
      if (target.role === "owner") {
        return apiError(c, 403, "owner_protected", "The team owner cannot be removed");
      }
      if (target.userId === session.user.id) {
        return apiError(c, 403, "self_removal", "The current user cannot remove themselves");
      }
      await deps.postgres.db.delete(member).where(eq(member.id, target.id));
      return c.body(null, 204);
    });
