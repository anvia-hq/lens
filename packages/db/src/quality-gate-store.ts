import type { QualityGate, QualityGateInput } from "@lens/contracts";
import { and, asc, eq } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { qualityGate } from "./schema.js";

export async function listQualityGates(
  db: LensPostgres,
  projectId: string,
): Promise<QualityGate[]> {
  return (
    await db
      .select()
      .from(qualityGate)
      .where(eq(qualityGate.projectId, projectId))
      .orderBy(asc(qualityGate.name))
  ).map(gateFromRow);
}

export async function getQualityGate(
  db: LensPostgres,
  projectId: string,
  gateId: string,
): Promise<QualityGate | undefined> {
  const [row] = await db
    .select()
    .from(qualityGate)
    .where(and(eq(qualityGate.projectId, projectId), eq(qualityGate.id, gateId)))
    .limit(1);
  return row === undefined ? undefined : gateFromRow(row);
}

export async function createQualityGate(
  db: LensPostgres,
  projectId: string,
  input: QualityGateInput,
): Promise<QualityGate> {
  const [row] = await db
    .insert(qualityGate)
    .values({ projectId, ...input })
    .returning();
  if (row === undefined) throw new Error("Quality gate was not created");
  return gateFromRow(row);
}

export async function updateQualityGate(
  db: LensPostgres,
  projectId: string,
  gateId: string,
  input: QualityGateInput,
): Promise<QualityGate | undefined> {
  const [row] = await db
    .update(qualityGate)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(qualityGate.projectId, projectId), eq(qualityGate.id, gateId)))
    .returning();
  return row === undefined ? undefined : gateFromRow(row);
}

export async function deleteQualityGate(
  db: LensPostgres,
  projectId: string,
  gateId: string,
): Promise<boolean> {
  const rows = await db
    .delete(qualityGate)
    .where(and(eq(qualityGate.projectId, projectId), eq(qualityGate.id, gateId)))
    .returning({ id: qualityGate.id });
  return rows.length > 0;
}

function gateFromRow(row: typeof qualityGate.$inferSelect): QualityGate {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    suiteName: row.suiteName,
    environment: row.environment,
    minimumCaseCount: row.minimumCaseCount,
    rules: row.rules,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
