import { project, projectApiKey } from "@lens/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, ensureDefaultTeam, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { createProjectSchema, projectSettingsSchema } from "./schema.js";
import { projectFromRow } from "./services.js";

export const createProjectsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const session = requiredSession(c);
      const team = await ensureDefaultTeam(deps.postgres.db, session.user);
      const rows = await deps.postgres.db
        .select()
        .from(project)
        .where(eq(project.organizationId, team.organization.id));
      return c.json({
        items: rows.map((row) => ({ ...projectFromRow(row), role: team.membership.role })),
      });
    })
    .post("/", async (c) => {
      const session = requiredSession(c);
      const parsed = createProjectSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_project", "Invalid project data");
      const team = await ensureDefaultTeam(deps.postgres.db, session.user);
      if (!canManage(team.membership.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const [created] = await deps.postgres.db
        .insert(project)
        .values({
          organizationId: team.organization.id,
          name: parsed.data.name,
          slug: parsed.data.slug,
        })
        .returning();
      if (created === undefined) {
        return apiError(c, 500, "create_failed", "Project was not created");
      }
      return c.json(projectFromRow(created), 201);
    })
    .patch("/:projectId/settings", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const parsed = projectSettingsSchema.safeParse(await safeJson(c));
      if (!parsed.success) {
        return apiError(c, 400, "invalid_settings", "Invalid project settings");
      }
      const [updated] = await deps.postgres.db
        .update(project)
        .set({
          retentionDays:
            parsed.data.retentionDays === null ? "unlimited" : String(parsed.data.retentionDays),
          redactionPatterns: parsed.data.redactionPatterns,
          updatedAt: new Date(),
        })
        .where(eq(project.id, access.project.id))
        .returning();
      await deps.queues.maintenance.add("reconcile-retention", {
        projectId: access.project.id,
        retentionDays: parsed.data.retentionDays,
      });
      if (updated === undefined) {
        return apiError(c, 500, "update_failed", "Project was not updated");
      }
      return c.json(projectFromRow(updated));
    })
    .delete("/:projectId", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      await deps.postgres.db.transaction(async (tx) => {
        await tx
          .update(project)
          .set({ state: "deleting", updatedAt: new Date() })
          .where(eq(project.id, access.project.id));
        await tx
          .update(projectApiKey)
          .set({ revokedAt: new Date() })
          .where(eq(projectApiKey.projectId, access.project.id));
      });
      await deps.queues.maintenance.add("delete-project", { projectId: access.project.id });
      return c.body(null, 202);
    });
