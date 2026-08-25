import { jobOutbox, jobOutboxValues, project, projectApiKey, projectMcpToken } from "@lens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { appMembership, canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { createProjectSchema, projectSettingsSchema } from "./schema.js";
import { projectFromRow } from "./services.js";

export const createProjectsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const session = requiredSession(c);
      const app = await appMembership(deps.postgres.db, session.user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      const rows = await deps.postgres.db
        .select()
        .from(project)
        .where(eq(project.organizationId, app.organization.id));
      return c.json({
        items: rows.map((row) => ({ ...projectFromRow(row), role: app.membership.role })),
      });
    })
    .post("/", async (c) => {
      const session = requiredSession(c);
      const parsed = createProjectSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_project", "Invalid project data");
      const app = await appMembership(deps.postgres.db, session.user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      if (!canManage(app.membership.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const [created] = await deps.postgres.db
        .insert(project)
        .values({
          organizationId: app.organization.id,
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
      if (access.project.state !== "active") {
        return apiError(c, 409, "project_deleting", "Project deletion is already in progress");
      }
      const parsed = projectSettingsSchema.safeParse(await safeJson(c));
      if (!parsed.success) {
        return apiError(c, 400, "invalid_settings", "Invalid project settings");
      }
      const updated = await deps.postgres.db.transaction(async (tx) => {
        const [row] = await tx
          .update(project)
          .set({
            retentionDays:
              parsed.data.retentionDays === null ? "unlimited" : String(parsed.data.retentionDays),
            updatedAt: new Date(),
          })
          .where(and(eq(project.id, access.project.id), eq(project.state, "active")))
          .returning();
        if (row === undefined) return null;
        await tx.insert(jobOutbox).values(
          jobOutboxValues({
            queue: "maintenance",
            name: "reconcile-retention",
            payload: { projectId: access.project.id },
          }),
        );
        return row;
      });
      if (updated === null) {
        return apiError(c, 409, "project_deleting", "Project deletion is already in progress");
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
      if (access.project.state === "deleting") return c.body(null, 202);
      await deps.postgres.db.transaction(async (tx) => {
        const [deleting] = await tx
          .update(project)
          .set({ state: "deleting", updatedAt: new Date() })
          .where(and(eq(project.id, access.project.id), eq(project.state, "active")))
          .returning({ id: project.id });
        if (deleting === undefined) return;
        await tx
          .update(projectApiKey)
          .set({ revokedAt: new Date() })
          .where(eq(projectApiKey.projectId, access.project.id));
        await tx
          .update(projectMcpToken)
          .set({ revokedAt: new Date() })
          .where(eq(projectMcpToken.projectId, access.project.id));
        await tx.insert(jobOutbox).values(
          jobOutboxValues({
            queue: "maintenance",
            name: "delete-project",
            payload: { projectId: access.project.id },
          }),
        );
      });
      return c.body(null, 202);
    });
