import { createMcpTokenSchema } from "@lens/contracts";
import { mcpToken } from "@lens/db";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { appMembership, canManage } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import { createMcpCredentials } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { mcpTokenFromRow } from "./services.js";

export const createMcpTokensRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const app = await appMembership(deps.postgres.db, requiredSession(c).user.id);
      if (app === undefined) return forbidden(c);
      if (!canManage(app.membership.role)) return adminRequired(c);
      const rows = await deps.postgres.db.select().from(mcpToken).orderBy(desc(mcpToken.createdAt));
      return c.json({ items: rows.map(mcpTokenFromRow) });
    })
    .post(
      "/",
      jsonInput(createMcpTokenSchema, "invalid_token", "Invalid MCP token data"),
      async (c) => {
        const session = requiredSession(c);
        const app = await appMembership(deps.postgres.db, session.user.id);
        if (app === undefined) return forbidden(c);
        if (!canManage(app.membership.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        const expiresAt = parsed.expiresAt === null ? null : new Date(parsed.expiresAt);
        if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
          return apiError(c, 400, "invalid_expiry", "Token expiry must be in the future");
        }
        const generated = createMcpCredentials(deps.config.INGESTION_KEY_PEPPER);
        const [created] = await deps.postgres.db
          .insert(mcpToken)
          .values({
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
    .delete("/:tokenId", async (c) => {
      const app = await appMembership(deps.postgres.db, requiredSession(c).user.id);
      if (app === undefined) return forbidden(c);
      if (!canManage(app.membership.role)) return adminRequired(c);
      await deps.postgres.db
        .update(mcpToken)
        .set({ revokedAt: new Date() })
        .where(eq(mcpToken.id, c.req.param("tokenId")));
      return c.body(null, 204);
    });

function forbidden(c: Parameters<typeof requiredSession>[0]) {
  return apiError(c, 403, "forbidden", "Membership is required");
}

function adminRequired(c: Parameters<typeof requiredSession>[0]) {
  return apiError(c, 403, "forbidden", "Admin access is required");
}
