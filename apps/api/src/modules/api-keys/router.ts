import { projectApiKey } from "@lens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import { createIngestionCredentials } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { createApiKeySchema } from "./schema.js";
import { apiKeyFromRow } from "./services.js";

export const createApiKeysRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/keys", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const rows = await deps.postgres.db
        .select()
        .from(projectApiKey)
        .where(eq(projectApiKey.projectId, access.project.id));
      return c.json({ items: rows.map(apiKeyFromRow) });
    })
    .post("/:projectId/keys", async (c) => {
      const session = requiredSession(c);
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        session.user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      const parsed = createApiKeySchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_key", "A key name is required");
      const generated = createIngestionCredentials(deps.config.INGESTION_KEY_PEPPER);
      const [created] = await deps.postgres.db
        .insert(projectApiKey)
        .values({
          projectId: access.project.id,
          name: parsed.data.name,
          publicKey: generated.publicKey,
          secretHash: generated.hash,
          createdBy: session.user.id,
        })
        .returning();
      if (created === undefined) {
        return apiError(c, 500, "create_failed", "Ingestion key was not created");
      }
      return c.json({ ...apiKeyFromRow(created), secretKey: generated.secretKey }, 201);
    })
    .delete("/:projectId/keys/:keyId", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) {
        return apiError(c, 403, "forbidden", "Admin access is required");
      }
      await deps.postgres.db
        .update(projectApiKey)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(projectApiKey.id, c.req.param("keyId")),
            eq(projectApiKey.projectId, access.project.id),
          ),
        );
      return c.body(null, 204);
    });
