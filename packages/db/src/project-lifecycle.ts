import { and, eq } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { project } from "./schema.js";

/**
 * Hold a shared row lock until the ClickHouse write has finished. The project's
 * active -> deleting update must acquire a conflicting lock, so it cannot commit
 * until all admitted writes finish. Jobs admitted after that update are skipped.
 * Callers must await every external write before returning (including failures).
 */
export async function withActiveProjectWrite<T>(
  db: LensPostgres,
  projectId: string,
  write: (row: typeof project.$inferSelect, tx: LensPostgres) => Promise<T>,
): Promise<T | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.state, "active")))
      .for("share");
    if (row === undefined) return undefined;
    return write(row, tx);
  });
}
