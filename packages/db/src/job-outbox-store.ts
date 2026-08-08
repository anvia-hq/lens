import type { JobOutboxEvent } from "@lens/contracts";
import { and, asc, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { jobOutbox } from "./schema.js";

export type JobOutboxRow = typeof jobOutbox.$inferSelect;

export function jobOutboxValues(event: JobOutboxEvent): typeof jobOutbox.$inferInsert {
  return {
    queue: event.queue,
    name: event.name,
    payload: event.payload,
  };
}

export async function claimJobOutbox(
  db: LensPostgres,
  options: { batchSize: number; leaseMs: number; now?: Date },
): Promise<JobOutboxRow[]> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(jobOutbox)
      .where(
        and(
          lte(jobOutbox.availableAt, now),
          or(isNull(jobOutbox.leaseExpiresAt), lte(jobOutbox.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(jobOutbox.createdAt), asc(jobOutbox.id))
      .limit(options.batchSize)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);
    await tx
      .update(jobOutbox)
      .set({
        attempts: sql`${jobOutbox.attempts} + 1`,
        leaseExpiresAt,
        lastError: null,
      })
      .where(inArray(jobOutbox.id, ids));
    return rows.map((row) => ({
      ...row,
      attempts: row.attempts + 1,
      leaseExpiresAt,
      lastError: null,
    }));
  });
}

export async function completeJobOutbox(db: LensPostgres, id: string): Promise<void> {
  await db.delete(jobOutbox).where(inArray(jobOutbox.id, [id]));
}

export async function retryJobOutbox(
  db: LensPostgres,
  id: string,
  error: unknown,
  delayMs: number,
  now = new Date(),
): Promise<void> {
  await db
    .update(jobOutbox)
    .set({
      availableAt: new Date(now.getTime() + delayMs),
      leaseExpiresAt: null,
      lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown dispatch error",
    })
    .where(inArray(jobOutbox.id, [id]));
}
