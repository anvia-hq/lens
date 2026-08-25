import type { LensPostgres } from "@lens/db";
import { project, projectApiKey } from "@lens/db";
import { eq } from "drizzle-orm";
import { verifyIngestionSecret } from "../../utils/security.js";
import type { ApiDependencies } from "../../utils/types.js";

export async function authenticateIngestionKey(
  db: LensPostgres,
  publicKey: string,
  secretKey: string,
  pepper: string,
) {
  const [row] = await db
    .select({
      apiKeyId: projectApiKey.id,
      secretHash: projectApiKey.secretHash,
      revokedAt: projectApiKey.revokedAt,
      project,
    })
    .from(projectApiKey)
    .innerJoin(project, eq(projectApiKey.projectId, project.id))
    .where(eq(projectApiKey.publicKey, publicKey))
    .limit(1);
  if (
    row === undefined ||
    row.revokedAt !== null ||
    !verifyIngestionSecret(secretKey, row.secretHash, pepper)
  ) {
    return undefined;
  }
  return row;
}

export function recordProjectKeyUsage(
  deps: ApiDependencies,
  apiKeyId: string,
  projectId: string,
): void {
  void deps.postgres.db
    .update(projectApiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(projectApiKey.id, apiKeyId))
    .catch((error: unknown) => {
      deps.logger.warn({ err: error, apiKeyId, projectId }, "failed to record project key usage");
    });
}
