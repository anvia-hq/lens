import { createMcpTokenSchema } from "@lens/contracts";
import { projectMcpToken } from "@lens/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import { createMcpCredentials } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { mcpTokenFromRow } from "./services.js";

export const createMcpTokensRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/mcp-tokens", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const rows = await deps.postgres.db
        .select()
        .from(projectMcpToken)
        .where(eq(projectMcpToken.projectId, access.project.id))
        .orderBy(desc(projectMcpToken.createdAt));
      return c.json({ items: rows.map(mcpTokenFromRow) });
    })
    .post(
      "/:projectId/mcp-tokens",
      jsonInput(createMcpTokenSchema, "invalid_token", "Invalid MCP token data"),
      async (c) => {
        const session = requiredSession(c);
        const access = await requireProjectAccess(
          deps.postgres.db,
          c.req.param("projectId"),
          session.user.id,
        );
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        const expiresAt = parsed.expiresAt === null ? null : new Date(parsed.expiresAt);
        if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
          return apiError(c, 400, "invalid_expiry", "Token expiry must be in the future");
        }
        const generated = createMcpCredentials(deps.config.INGESTION_KEY_PEPPER);
        const [created] = await deps.postgres.db
          .insert(projectMcpToken)
          .values({
            projectId: access.project.id,
            name: parsed.name,
            tokenPrefix: generated.prefix,
            tokenHash: generated.hash,
            allowRawPayloads: parsed.allowRawPayloads,
            createdBy: session.user.id,
            expiresAt,
          })
          .returning();
        if (created === undefined) {
          return apiError(c, 500, "create_failed", "MCP token was not created");
        }
        return c.json({ ...mcpTokenFromRow(created), token: generated.token }, 201);
      },
    )
    .delete("/:projectId/mcp-tokens/:tokenId", async (c) => {
      const access = await requireProjectAccess(
        deps.postgres.db,
        c.req.param("projectId"),
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      await deps.postgres.db
        .update(projectMcpToken)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(projectMcpToken.id, c.req.param("tokenId")),
            eq(projectMcpToken.projectId, access.project.id),
          ),
        );
      return c.body(null, 204);
    });

function adminRequired(c: Parameters<typeof requiredSession>[0]) {
  return apiError(c, 403, "forbidden", "Admin access is required");
}
