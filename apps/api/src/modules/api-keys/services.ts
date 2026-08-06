import type { ProjectApiKey } from "@lens/contracts";
import type { projectApiKey } from "@lens/db";

export function apiKeyFromRow(row: typeof projectApiKey.$inferSelect): ProjectApiKey {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    publicKey: row.publicKey,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
