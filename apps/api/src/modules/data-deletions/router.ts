import { dataDeletionInputSchema } from "@lens/contracts";
import {
  dataDeletionRequest,
  dataDeletionRequestFromRow,
  jobOutbox,
  jobOutboxValues,
} from "@lens/db";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createDataDeletionsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/data-deletions", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const rows = await deps.postgres.db
        .select()
        .from(dataDeletionRequest)
        .where(eq(dataDeletionRequest.projectId, projectId))
        .orderBy(desc(dataDeletionRequest.createdAt))
        .limit(100);
      return c.json({ items: rows.map(dataDeletionRequestFromRow) });
    })
    .post("/:projectId/data-deletions", async (c) => {
      const projectId = c.req.param("projectId");
      const session = requiredSession(c);
      const access = await requireProjectAccess(deps.postgres.db, projectId, session.user.id);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      if (access.project.state !== "active") {
        return apiError(c, 409, "project_deleting", "Project deletion is already in progress");
      }
      const input = dataDeletionInputSchema.safeParse(await safeJson(c));
      if (!input.success) {
        return apiError(c, 400, "invalid_deletion", "Invalid data deletion request");
      }
      const created = await deps.postgres.db.transaction(async (tx) => {
        const [request] = await tx
          .insert(dataDeletionRequest)
          .values({
            projectId,
            entityType: input.data.entityType,
            entityIds: input.data.ids,
            requestedBy: session.user.id,
          })
          .returning();
        if (request === undefined) throw new Error("Deletion request was not created");
        await tx.insert(jobOutbox).values(
          jobOutboxValues({
            queue: "maintenance",
            name: "delete-data",
            payload: { requestId: request.id },
          }),
        );
        return request;
      });
      return c.json(dataDeletionRequestFromRow(created), 202);
    });
