import type { LensPostgres } from "@lens/db";
import { project, projectApiKey } from "@lens/db";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { verifyIngestionSecret } from "../../utils/security.js";
import type { ApiDependencies } from "../../utils/types.js";

const KEY_USAGE_TOUCH_INTERVAL_MS = 5 * 60_000;
const MAX_TRACKED_KEY_USAGE = 10_000;
const recentKeyUsage = new Map<string, number>();

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
  nowMs = Date.now(),
): void {
  const lastRecorded = recentKeyUsage.get(apiKeyId);
  if (lastRecorded !== undefined && nowMs - lastRecorded < KEY_USAGE_TOUCH_INTERVAL_MS) {
    return;
  }
  if (!recentKeyUsage.has(apiKeyId) && recentKeyUsage.size >= MAX_TRACKED_KEY_USAGE) {
    const oldestKey = recentKeyUsage.keys().next().value;
    if (oldestKey !== undefined) recentKeyUsage.delete(oldestKey);
  }
  recentKeyUsage.set(apiKeyId, nowMs);

  const now = new Date(nowMs);
  const staleBefore = new Date(nowMs - KEY_USAGE_TOUCH_INTERVAL_MS);
  void deps.postgres.db
    .update(projectApiKey)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(projectApiKey.id, apiKeyId),
        or(isNull(projectApiKey.lastUsedAt), lt(projectApiKey.lastUsedAt, staleBefore)),
      ),
    )
    .catch((error: unknown) => {
      if (recentKeyUsage.get(apiKeyId) === nowMs) recentKeyUsage.delete(apiKeyId);
      deps.logger.warn({ err: error, apiKeyId, projectId }, "failed to record project key usage");
    });
}

export function resetProjectKeyUsageCache(): void {
  recentKeyUsage.clear();
}
