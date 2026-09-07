import type {
  PromptContent,
  PromptDetail,
  PromptInput,
  PromptLabel,
  PromptLabelEvent,
  PromptLabelInput,
  PromptSummary,
  PromptUpdate,
  PromptVersion,
  PromptVersionCommit,
  ResolvedPrompt,
} from "@lens/contracts";
import {
  DEFAULT_PROMPT_LABEL,
  promptContentSchema,
  promptDeploymentQuerySchema,
  resolvedPromptSchema,
} from "@lens/contracts";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { prompt, promptLabel, promptLabelEvent, promptVersion } from "./schema.js";

export async function listPrompts(
  db: LensPostgres,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<PromptSummary[]> {
  const rows = await db
    .select()
    .from(prompt)
    .where(
      options.includeArchived
        ? eq(prompt.projectId, projectId)
        : and(eq(prompt.projectId, projectId), isNull(prompt.archivedAt)),
    )
    .orderBy(asc(prompt.name));
  return Promise.all(rows.map((row) => summarizePrompt(db, row)));
}

export async function getPrompt(
  db: LensPostgres,
  projectId: string,
  promptId: string,
): Promise<PromptDetail | undefined> {
  const row = await promptRow(db, projectId, promptId);
  if (row === undefined) return undefined;
  const versions = await versionRows(db, promptId);
  const labels = await labelRows(db, promptId);
  return { ...summaryFromRow(row, versions, labels), versions };
}

export async function createPrompt(
  db: LensPostgres,
  projectId: string,
  userId: string,
  input: PromptInput,
): Promise<PromptDetail> {
  const promptId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(prompt)
      .values({
        projectId,
        createdBy: userId,
        name: input.name,
        description: input.description,
      })
      .returning({ id: prompt.id });
    if (created === undefined) throw new Error("Prompt was not created");
    const [version] = await tx
      .insert(promptVersion)
      .values({
        ...versionValues(input.content, input.changeMessage),
        promptId: created.id,
        version: 1,
        createdBy: userId,
      })
      .returning({ id: promptVersion.id });
    if (version === undefined) throw new Error("Prompt version was not created");
    const labels = uniqueLabels(input.labels);
    if (labels.length > 0) {
      await tx.insert(promptLabel).values(
        labels.map((label) => ({
          promptId: created.id,
          label,
          versionId: version.id,
          updatedBy: userId,
        })),
      );
      await tx.insert(promptLabelEvent).values(
        labels.map((label) => ({
          promptId: created.id,
          label,
          fromVersion: null,
          toVersion: 1,
          changedBy: userId,
        })),
      );
    }
    return created.id;
  });
  const created = await getPrompt(db, projectId, promptId);
  if (created === undefined) throw new Error("Prompt was not found after creation");
  return created;
}

export async function updatePrompt(
  db: LensPostgres,
  projectId: string,
  promptId: string,
  input: PromptUpdate,
): Promise<PromptDetail | undefined> {
  const [updated] = await db
    .update(prompt)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(prompt.id, promptId), eq(prompt.projectId, projectId)))
    .returning({ id: prompt.id });
  return updated === undefined ? undefined : getPrompt(db, projectId, promptId);
}

export async function archivePrompt(
  db: LensPostgres,
  projectId: string,
  promptId: string,
): Promise<boolean> {
  const rows = await db
    .update(prompt)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(prompt.id, promptId), eq(prompt.projectId, projectId), isNull(prompt.archivedAt)))
    .returning({ id: prompt.id });
  return rows.length > 0;
}

export async function createPromptVersion(
  db: LensPostgres,
  projectId: string,
  promptId: string,
  userId: string,
  commit: PromptVersionCommit,
): Promise<PromptDetail | undefined> {
  const nextVersion = await db.transaction(async (tx) => {
    const locked = await lockActivePrompt(tx, projectId, promptId);
    if (locked === undefined) return undefined;
    const [maximum] = await tx
      .select({ value: sql<number>`coalesce(max(${promptVersion.version}), 0)` })
      .from(promptVersion)
      .where(eq(promptVersion.promptId, promptId));
    const version = Number(maximum?.value ?? 0) + 1;
    await tx.insert(promptVersion).values({
      ...versionValues(commit, commit.changeMessage),
      promptId,
      version,
      createdBy: userId,
    });
    await tx.update(prompt).set({ updatedAt: new Date() }).where(eq(prompt.id, promptId));
    return version;
  });
  if (nextVersion === undefined) return undefined;
  const detail = await getPrompt(db, projectId, promptId);
  if (detail === undefined) throw new Error("Prompt was not found after version creation");
  return detail;
}

export async function setPromptLabel(
  db: LensPostgres,
  projectId: string,
  promptId: string,
  userId: string,
  input: PromptLabelInput,
): Promise<PromptDetail | "unknown_version" | undefined> {
  const result = await db.transaction(async (tx) => {
    const locked = await lockActivePrompt(tx, projectId, promptId);
    if (locked === undefined) return "missing" as const;
    const [target] = await tx
      .select({ id: promptVersion.id, version: promptVersion.version })
      .from(promptVersion)
      .where(and(eq(promptVersion.promptId, promptId), eq(promptVersion.version, input.version)))
      .limit(1);
    if (target === undefined) return "unknown_version" as const;
    const label = input.label.trim();
    const [existing] = await tx
      .select({ id: promptLabel.id })
      .from(promptLabel)
      .where(
        and(
          eq(promptLabel.promptId, promptId),
          eq(sql`lower(${promptLabel.label})`, label.toLocaleLowerCase()),
        ),
      )
      .limit(1);
    const [current] = await tx
      .select({ version: promptVersion.version })
      .from(promptLabel)
      .innerJoin(promptVersion, eq(promptLabel.versionId, promptVersion.id))
      .where(
        and(
          eq(promptLabel.promptId, promptId),
          eq(sql`lower(${promptLabel.label})`, label.toLocaleLowerCase()),
        ),
      )
      .limit(1);
    if (existing === undefined) {
      await tx
        .insert(promptLabel)
        .values({ promptId, label, versionId: target.id, updatedBy: userId });
    } else {
      await tx
        .update(promptLabel)
        .set({ label, versionId: target.id, updatedBy: userId, updatedAt: new Date() })
        .where(eq(promptLabel.id, existing.id));
    }
    await tx.insert(promptLabelEvent).values({
      promptId,
      label,
      fromVersion: current?.version ?? null,
      toVersion: target.version,
      changedBy: userId,
    });
    await tx.update(prompt).set({ updatedAt: new Date() }).where(eq(prompt.id, promptId));
    return "moved" as const;
  });
  if (result === "missing") return undefined;
  if (result === "unknown_version") return "unknown_version";
  const detail = await getPrompt(db, projectId, promptId);
  if (detail === undefined) throw new Error("Prompt was not found after label update");
  return detail;
}

export async function listPromptLabelEvents(
  db: LensPostgres,
  projectId: string,
  promptId: string,
  options: { label?: string; limit?: number } = {},
): Promise<PromptLabelEvent[]> {
  const row = await promptRow(db, projectId, promptId);
  if (row === undefined) return [];
  const filters = [eq(promptLabelEvent.promptId, promptId)];
  if (options.label !== undefined) {
    filters.push(eq(sql`lower(${promptLabelEvent.label})`, options.label.toLocaleLowerCase()));
  }
  const rows = await db
    .select()
    .from(promptLabelEvent)
    .where(and(...filters))
    .orderBy(desc(promptLabelEvent.createdAt))
    .limit(Math.min(200, Math.max(1, options.limit ?? 50)));
  return rows.map((row) => ({
    id: row.id,
    promptId: row.promptId,
    label: row.label,
    fromVersion: row.fromVersion,
    toVersion: row.toVersion,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getPromptDeployment(
  db: LensPostgres,
  projectId: string,
  name: string,
  query: { label?: string | undefined; version?: number | undefined } = {},
): Promise<ResolvedPrompt | "no_deployment" | "unknown_version" | undefined> {
  const selector = promptDeploymentQuerySchema.parse(query);
  const [row] = await db
    .select()
    .from(prompt)
    .where(
      and(
        eq(prompt.projectId, projectId),
        isNull(prompt.archivedAt),
        eq(sql`lower(${prompt.name})`, name.toLocaleLowerCase()),
      ),
    )
    .limit(1);
  if (row === undefined) return undefined;
  const label = selector.label ?? DEFAULT_PROMPT_LABEL;
  const filters = [eq(promptVersion.promptId, row.id)];
  if (selector.version !== undefined) {
    filters.push(eq(promptVersion.version, sql`${selector.version}::bigint`));
  } else {
    filters.push(
      eq(
        promptVersion.id,
        db
          .select({ id: promptLabel.versionId })
          .from(promptLabel)
          .where(
            and(
              eq(promptLabel.promptId, row.id),
              eq(sql`lower(${promptLabel.label})`, label.toLocaleLowerCase()),
            ),
          )
          .limit(1),
      ),
    );
  }
  const [version] = await db
    .select()
    .from(promptVersion)
    .where(and(...filters))
    .limit(1);
  if (version === undefined)
    return selector.version === undefined ? "no_deployment" : "unknown_version";
  const labels = await db
    .select({ label: promptLabel.label })
    .from(promptLabel)
    .where(eq(promptLabel.versionId, version.id))
    .orderBy(asc(promptLabel.label));
  return resolvedPromptSchema.parse({
    name: row.name,
    version: version.version,
    type: version.type,
    template: version.template,
    messages: version.messages,
    config: version.config,
    selector: selector.version === undefined ? { label } : { version: selector.version },
    labels: labels.map((entry) => entry.label),
  });
}

async function promptRow(db: LensPostgres, projectId: string, promptId: string) {
  const [row] = await db
    .select()
    .from(prompt)
    .where(and(eq(prompt.id, promptId), eq(prompt.projectId, projectId)))
    .limit(1);
  return row;
}

async function lockActivePrompt(db: LensPostgres, projectId: string, promptId: string) {
  const [row] = await db
    .select({ id: prompt.id })
    .from(prompt)
    .where(and(eq(prompt.id, promptId), eq(prompt.projectId, projectId), isNull(prompt.archivedAt)))
    .for("update")
    .limit(1);
  return row?.id;
}

async function versionRows(db: LensPostgres, promptId: string): Promise<PromptVersion[]> {
  const rows = await db
    .select()
    .from(promptVersion)
    .where(eq(promptVersion.promptId, promptId))
    .orderBy(desc(promptVersion.version));
  return rows.map((row) => ({
    id: row.id,
    promptId: row.promptId,
    version: row.version,
    type: row.type,
    template: row.template,
    messages: row.messages,
    config: row.config,
    changeMessage: row.changeMessage,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function labelRows(db: LensPostgres, promptId: string): Promise<PromptLabel[]> {
  const rows = await db
    .select({ label: promptLabel, version: promptVersion.version })
    .from(promptLabel)
    .innerJoin(promptVersion, eq(promptLabel.versionId, promptVersion.id))
    .where(eq(promptLabel.promptId, promptId))
    .orderBy(asc(promptLabel.label));
  return rows.map((row) => ({
    label: row.label.label,
    version: row.version,
    updatedBy: row.label.updatedBy,
    updatedAt: row.label.updatedAt.toISOString(),
  }));
}

async function summarizePrompt(
  db: LensPostgres,
  row: typeof prompt.$inferSelect,
): Promise<PromptSummary> {
  const versions = await versionRows(db, row.id);
  const labels = await labelRows(db, row.id);
  return summaryFromRow(row, versions, labels);
}

function summaryFromRow(
  row: typeof prompt.$inferSelect,
  versions: PromptVersion[],
  labels: PromptLabel[],
): PromptSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    latestVersion: versions[0]?.version ?? 0,
    versionCount: versions.length,
    labels,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function versionValues(content: PromptContent, changeMessage: string | undefined) {
  content = promptContentSchema.parse(content);
  return {
    type: content.type,
    template: content.type === "text" ? content.template : null,
    messages: content.type === "chat" ? content.messages : null,
    config: content.config ?? {},
    changeMessage: changeMessage ?? null,
  };
}

function uniqueLabels(labels: string[] | undefined): string[] {
  if (labels === undefined) return [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const label of labels) {
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(label);
  }
  return unique;
}
