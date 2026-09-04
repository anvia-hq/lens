import type { McpToken } from "@lens/contracts";
import type { mcpToken } from "@lens/db";

export function mcpTokenFromRow(row: typeof mcpToken.$inferSelect): McpToken {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    allowRawPayloads: row.allowRawPayloads,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
