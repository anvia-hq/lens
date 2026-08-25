import type { ProjectMcpToken } from "@lens/contracts";
import type { projectMcpToken } from "@lens/db";

export function mcpTokenFromRow(row: typeof projectMcpToken.$inferSelect): ProjectMcpToken {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    allowRawPayloads: row.allowRawPayloads,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
