import type {
  ManagedDatasetCaseInput,
  ManagedDatasetDetail,
  ManagedDatasetInput,
  ManagedDatasetSummary,
  ManagedDatasetUpdate,
  ManagedDatasetVersion,
  ManagedDatasetVersionDetail,
} from "@lens/contracts";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { managedDataset, managedDatasetCase, managedDatasetVersion } from "./schema.js";

export async function listManagedDatasets(
  db: LensPostgres,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<ManagedDatasetSummary[]> {
  const rows = await db
    .select()
    .from(managedDataset)
    .where(
      options.includeArchived
        ? eq(managedDataset.projectId, projectId)
        : and(eq(managedDataset.projectId, projectId), isNull(managedDataset.archivedAt)),
    )
    .orderBy(asc(managedDataset.name));
  return Promise.all(rows.map((row) => summarizeDataset(db, row)));
}

export async function getManagedDataset(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
): Promise<ManagedDatasetDetail | undefined> {
  const row = await datasetRow(db, projectId, datasetId);
  if (row === undefined) return undefined;
  const versions = await versionRows(db, datasetId);
  const summary = summaryFromRows(row, versions);
  return { ...summary, versions };
}

export async function createManagedDataset(
  db: LensPostgres,
  projectId: string,
  userId: string,
  input: ManagedDatasetInput,
): Promise<ManagedDatasetDetail> {
  const datasetId = await db.transaction(async (tx) => {
    const [dataset] = await tx
      .insert(managedDataset)
      .values({
        projectId,
        createdBy: userId,
        name: input.name,
        description: input.description,
        metadata: input.metadata ?? {},
      })
      .returning({ id: managedDataset.id });
    if (dataset === undefined) throw new Error("Managed dataset was not created");
    await tx.insert(managedDatasetVersion).values({
      datasetId: dataset.id,
      version: "v1",
      createdBy: userId,
    });
    return dataset.id;
  });
  const created = await getManagedDataset(db, projectId, datasetId);
  if (created === undefined) throw new Error("Managed dataset was not found after creation");
  return created;
}

export async function createManagedDatasetWithCases(
  db: LensPostgres,
  projectId: string,
  userId: string,
  input: ManagedDatasetInput,
  version: string,
  items: ManagedDatasetCaseInput[],
): Promise<ManagedDatasetDetail> {
  const datasetId = await db.transaction(async (tx) => {
    const [dataset] = await tx
      .insert(managedDataset)
      .values({
        projectId,
        createdBy: userId,
        name: input.name,
        description: input.description,
        metadata: input.metadata ?? {},
      })
      .returning({ id: managedDataset.id });
    if (dataset === undefined) throw new Error("Managed dataset was not created");
    const [draft] = await tx
      .insert(managedDatasetVersion)
      .values({ datasetId: dataset.id, version, createdBy: userId })
      .returning({ id: managedDatasetVersion.id });
    if (draft === undefined) throw new Error("Managed dataset draft was not created");
    if (items.length > 0) {
      await tx.insert(managedDatasetCase).values(
        items.map((item, position) => ({
          versionId: draft.id,
          caseId: item.id,
          position,
          item,
        })),
      );
    }
    return dataset.id;
  });
  const created = await getManagedDataset(db, projectId, datasetId);
  if (created === undefined) throw new Error("Managed dataset was not found after creation");
  return created;
}

export async function updateManagedDataset(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  input: ManagedDatasetUpdate,
): Promise<ManagedDatasetDetail | undefined> {
  const [updated] = await db
    .update(managedDataset)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(managedDataset.id, datasetId), eq(managedDataset.projectId, projectId)))
    .returning({ id: managedDataset.id });
  return updated === undefined ? undefined : getManagedDataset(db, projectId, datasetId);
}

export async function archiveManagedDataset(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
): Promise<boolean> {
  const rows = await db
    .update(managedDataset)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(managedDataset.id, datasetId),
        eq(managedDataset.projectId, projectId),
        isNull(managedDataset.archivedAt),
      ),
    )
    .returning({ id: managedDataset.id });
  return rows.length > 0;
}

export async function createManagedDatasetVersion(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  userId: string,
  version: string,
): Promise<ManagedDatasetVersionDetail | undefined> {
  const exists = await datasetRow(db, projectId, datasetId);
  if (exists === undefined || exists.archivedAt !== null) return undefined;
  const versionId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(managedDatasetVersion)
      .values({ datasetId, version, createdBy: userId })
      .returning({ id: managedDatasetVersion.id });
    if (created === undefined) throw new Error("Managed dataset version was not created");
    const [latest] = await tx
      .select({ id: managedDatasetVersion.id })
      .from(managedDatasetVersion)
      .where(
        and(
          eq(managedDatasetVersion.datasetId, datasetId),
          eq(managedDatasetVersion.status, "published"),
        ),
      )
      .orderBy(desc(managedDatasetVersion.publishedAt))
      .limit(1);
    if (latest !== undefined) {
      const items = await tx
        .select({
          caseId: managedDatasetCase.caseId,
          position: managedDatasetCase.position,
          item: managedDatasetCase.item,
        })
        .from(managedDatasetCase)
        .where(eq(managedDatasetCase.versionId, latest.id))
        .orderBy(asc(managedDatasetCase.position));
      if (items.length > 0) {
        await tx.insert(managedDatasetCase).values(
          items.map((item) => ({
            versionId: created.id,
            caseId: item.caseId,
            position: item.position,
            item: item.item,
          })),
        );
      }
    }
    return created.id;
  });
  return getManagedDatasetVersion(db, projectId, datasetId, versionId);
}

export async function getManagedDatasetVersion(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
): Promise<ManagedDatasetVersionDetail | undefined> {
  const [row] = await db
    .select({ dataset: managedDataset, version: managedDatasetVersion })
    .from(managedDatasetVersion)
    .innerJoin(managedDataset, eq(managedDatasetVersion.datasetId, managedDataset.id))
    .where(
      and(
        eq(managedDataset.projectId, projectId),
        eq(managedDataset.id, datasetId),
        eq(managedDatasetVersion.id, versionId),
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  const items = await listManagedDatasetCases(db, versionId);
  return {
    ...versionFromRow(row.version, items.length),
    dataset: datasetBaseFromRow(row.dataset),
    items,
  };
}

export async function getPublishedManagedDataset(
  db: LensPostgres,
  projectId: string,
  name: string,
  version?: string,
): Promise<ManagedDatasetVersionDetail | undefined> {
  const filters = [
    eq(managedDataset.projectId, projectId),
    isNull(managedDataset.archivedAt),
    eq(sql`lower(${managedDataset.name})`, name.toLocaleLowerCase()),
    eq(managedDatasetVersion.status, "published"),
  ];
  if (version !== undefined) {
    filters.push(eq(sql`lower(${managedDatasetVersion.version})`, version.toLocaleLowerCase()));
  }
  const [row] = await db
    .select({ dataset: managedDataset, version: managedDatasetVersion })
    .from(managedDatasetVersion)
    .innerJoin(managedDataset, eq(managedDatasetVersion.datasetId, managedDataset.id))
    .where(and(...filters))
    .orderBy(desc(managedDatasetVersion.publishedAt))
    .limit(1);
  if (row === undefined) return undefined;
  const items = await listManagedDatasetCases(db, row.version.id);
  return {
    ...versionFromRow(row.version, items.length),
    dataset: datasetBaseFromRow(row.dataset),
    items,
  };
}

export async function upsertManagedDatasetCase(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
  item: ManagedDatasetCaseInput,
): Promise<ManagedDatasetVersionDetail | undefined> {
  const updated = await db.transaction(async (tx) => {
    const version = await lockEditableVersion(tx as LensPostgres, projectId, datasetId, versionId);
    if (version === undefined) return false;
    const [existing] = await tx
      .select({ id: managedDatasetCase.id })
      .from(managedDatasetCase)
      .where(
        and(
          eq(managedDatasetCase.versionId, versionId),
          eq(sql`lower(${managedDatasetCase.caseId})`, item.id.toLocaleLowerCase()),
        ),
      )
      .limit(1);
    if (existing === undefined) {
      const [last] = await tx
        .select({ position: managedDatasetCase.position })
        .from(managedDatasetCase)
        .where(eq(managedDatasetCase.versionId, versionId))
        .orderBy(desc(managedDatasetCase.position))
        .limit(1);
      await tx.insert(managedDatasetCase).values({
        versionId,
        caseId: item.id,
        position: (last?.position ?? -1) + 1,
        item,
      });
    } else {
      await tx
        .update(managedDatasetCase)
        .set({ caseId: item.id, item, updatedAt: new Date() })
        .where(eq(managedDatasetCase.id, existing.id));
    }
    await touchVersion(tx as LensPostgres, datasetId, versionId);
    return true;
  });
  if (!updated) return undefined;
  return getManagedDatasetVersion(db, projectId, datasetId, versionId);
}

export async function importManagedDatasetCases(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
  items: ManagedDatasetCaseInput[],
): Promise<ManagedDatasetVersionDetail | undefined> {
  const updated = await db.transaction(async (tx) => {
    const version = await lockEditableVersion(tx as LensPostgres, projectId, datasetId, versionId);
    if (version === undefined) return false;
    const existing = await tx
      .select({
        id: managedDatasetCase.id,
        caseId: managedDatasetCase.caseId,
        position: managedDatasetCase.position,
      })
      .from(managedDatasetCase)
      .where(eq(managedDatasetCase.versionId, versionId));
    const byCase = new Map(existing.map((row) => [row.caseId.toLocaleLowerCase(), row]));
    let position = existing.reduce((maximum, row) => Math.max(maximum, row.position), -1) + 1;
    for (const item of items) {
      const row = byCase.get(item.id.toLocaleLowerCase());
      if (row === undefined) {
        await tx.insert(managedDatasetCase).values({
          versionId,
          caseId: item.id,
          position,
          item,
        });
        position += 1;
      } else {
        await tx
          .update(managedDatasetCase)
          .set({ caseId: item.id, item, updatedAt: new Date() })
          .where(eq(managedDatasetCase.id, row.id));
      }
    }
    await touchVersion(tx as LensPostgres, datasetId, versionId);
    return true;
  });
  if (!updated) return undefined;
  return getManagedDatasetVersion(db, projectId, datasetId, versionId);
}

export async function deleteManagedDatasetCase(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
  caseId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const version = await lockEditableVersion(tx as LensPostgres, projectId, datasetId, versionId);
    if (version === undefined) return false;
    const rows = await tx
      .delete(managedDatasetCase)
      .where(
        and(
          eq(managedDatasetCase.versionId, versionId),
          eq(sql`lower(${managedDatasetCase.caseId})`, caseId.toLocaleLowerCase()),
        ),
      )
      .returning({ id: managedDatasetCase.id });
    if (rows.length > 0) await touchVersion(tx as LensPostgres, datasetId, versionId);
    return rows.length > 0;
  });
}

export async function publishManagedDatasetVersion(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
): Promise<ManagedDatasetVersionDetail | "empty" | undefined> {
  const result = await db.transaction(async (tx) => {
    const version = await lockEditableVersion(tx as LensPostgres, projectId, datasetId, versionId);
    if (version === undefined) return "missing" as const;
    const [caseCount] = await tx
      .select({ value: count() })
      .from(managedDatasetCase)
      .where(eq(managedDatasetCase.versionId, versionId));
    if (Number(caseCount?.value ?? 0) === 0) return "empty" as const;
    const now = new Date();
    await tx
      .update(managedDatasetVersion)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(
        and(
          eq(managedDatasetVersion.id, versionId),
          eq(managedDatasetVersion.datasetId, datasetId),
          eq(managedDatasetVersion.status, "draft"),
        ),
      );
    await tx.update(managedDataset).set({ updatedAt: now }).where(eq(managedDataset.id, datasetId));
    return "published" as const;
  });
  if (result === "missing") return undefined;
  if (result === "empty") return "empty";
  return getManagedDatasetVersion(db, projectId, datasetId, versionId);
}

async function datasetRow(db: LensPostgres, projectId: string, datasetId: string) {
  const [row] = await db
    .select()
    .from(managedDataset)
    .where(and(eq(managedDataset.id, datasetId), eq(managedDataset.projectId, projectId)))
    .limit(1);
  return row;
}

async function lockEditableVersion(
  db: LensPostgres,
  projectId: string,
  datasetId: string,
  versionId: string,
) {
  const [row] = await db
    .select({ version: managedDatasetVersion })
    .from(managedDatasetVersion)
    .innerJoin(managedDataset, eq(managedDatasetVersion.datasetId, managedDataset.id))
    .where(
      and(
        eq(managedDataset.projectId, projectId),
        isNull(managedDataset.archivedAt),
        eq(managedDataset.id, datasetId),
        eq(managedDatasetVersion.id, versionId),
        eq(managedDatasetVersion.status, "draft"),
      ),
    )
    .for("update")
    .limit(1);
  return row?.version;
}

async function versionRows(db: LensPostgres, datasetId: string): Promise<ManagedDatasetVersion[]> {
  const rows = await db
    .select({ version: managedDatasetVersion, caseCount: count(managedDatasetCase.id) })
    .from(managedDatasetVersion)
    .leftJoin(managedDatasetCase, eq(managedDatasetVersion.id, managedDatasetCase.versionId))
    .where(eq(managedDatasetVersion.datasetId, datasetId))
    .groupBy(managedDatasetVersion.id)
    .orderBy(desc(managedDatasetVersion.createdAt));
  return rows.map((row) => versionFromRow(row.version, Number(row.caseCount)));
}

async function summarizeDataset(
  db: LensPostgres,
  row: typeof managedDataset.$inferSelect,
): Promise<ManagedDatasetSummary> {
  return summaryFromRows(row, await versionRows(db, row.id));
}

function summaryFromRows(
  row: typeof managedDataset.$inferSelect,
  versions: ManagedDatasetVersion[],
): ManagedDatasetSummary {
  return {
    ...datasetBaseFromRow(row),
    draft: versions.find((version) => version.status === "draft") ?? null,
    latestPublished:
      versions
        .filter((version) => version.status === "published")
        .toSorted((left, right) =>
          (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""),
        )[0] ?? null,
    versionCount: versions.length,
  };
}

function datasetBaseFromRow(row: typeof managedDataset.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    metadata: row.metadata,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionFromRow(
  row: typeof managedDatasetVersion.$inferSelect,
  caseCount: number,
): ManagedDatasetVersion {
  return {
    id: row.id,
    datasetId: row.datasetId,
    version: row.version,
    status: row.status,
    caseCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

async function listManagedDatasetCases(
  db: LensPostgres,
  versionId: string,
): Promise<ManagedDatasetCaseInput[]> {
  return (
    await db
      .select({ item: managedDatasetCase.item })
      .from(managedDatasetCase)
      .where(eq(managedDatasetCase.versionId, versionId))
      .orderBy(asc(managedDatasetCase.position), asc(managedDatasetCase.caseId))
  ).map((row) => row.item);
}

async function touchVersion(db: LensPostgres, datasetId: string, versionId: string): Promise<void> {
  const now = new Date();
  await db
    .update(managedDatasetVersion)
    .set({ updatedAt: now })
    .where(eq(managedDatasetVersion.id, versionId));
  await db.update(managedDataset).set({ updatedAt: now }).where(eq(managedDataset.id, datasetId));
}
