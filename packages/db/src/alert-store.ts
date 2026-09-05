import type {
  AlertIncident,
  AlertIncidentEvidence,
  AlertRule,
  AlertRuleInput,
  AlertRuleKind,
  Page,
} from "@lens/contracts";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { LensPostgres } from "./index.js";
import { alertIncident, alertRule, user } from "./schema.js";

export type StoredAlertRule = AlertRule & {
  consecutiveBreaches: number;
  cooldownUntil: string | null;
};

export async function listAlertRules(db: LensPostgres, projectId: string): Promise<AlertRule[]> {
  return (
    await db
      .select()
      .from(alertRule)
      .where(eq(alertRule.projectId, projectId))
      .orderBy(asc(alertRule.name))
  ).map(ruleFromRow);
}

export async function listEnabledAlertRules(
  db: LensPostgres,
  projectId?: string,
): Promise<StoredAlertRule[]> {
  const where =
    projectId === undefined
      ? eq(alertRule.enabled, true)
      : and(eq(alertRule.enabled, true), eq(alertRule.projectId, projectId));
  return (await db.select().from(alertRule).where(where).orderBy(asc(alertRule.createdAt))).map(
    storedRuleFromRow,
  );
}

export async function getAlertRule(
  db: LensPostgres,
  projectId: string,
  ruleId: string,
): Promise<StoredAlertRule | undefined> {
  const [row] = await db
    .select()
    .from(alertRule)
    .where(and(eq(alertRule.projectId, projectId), eq(alertRule.id, ruleId)))
    .limit(1);
  return row === undefined ? undefined : storedRuleFromRow(row);
}

export async function alertRuleCount(db: LensPostgres, projectId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(alertRule)
    .where(eq(alertRule.projectId, projectId));
  return Number(row?.total ?? 0);
}

export async function createAlertRule(
  db: LensPostgres,
  projectId: string,
  createdBy: string,
  input: AlertRuleInput,
): Promise<AlertRule> {
  const [row] = await db
    .insert(alertRule)
    .values({ ...ruleValues(input), projectId, createdBy })
    .returning();
  if (row === undefined) throw new Error("Alert rule was not created");
  return ruleFromRow(row);
}

export async function updateAlertRule(
  db: LensPostgres,
  projectId: string,
  ruleId: string,
  input: AlertRuleInput,
): Promise<AlertRule | undefined> {
  await resolveRuleIncidents(db, projectId, ruleId, "rule_changed");
  const [row] = await db
    .update(alertRule)
    .set({
      ...ruleValues(input),
      consecutiveBreaches: 0,
      cooldownUntil: null,
      updatedAt: new Date(),
    })
    .where(and(eq(alertRule.projectId, projectId), eq(alertRule.id, ruleId)))
    .returning();
  return row === undefined ? undefined : ruleFromRow(row);
}

export async function deleteAlertRule(
  db: LensPostgres,
  projectId: string,
  ruleId: string,
  now = new Date(),
): Promise<boolean> {
  await resolveRuleIncidents(db, projectId, ruleId, "rule_deleted", now);
  const rows = await db
    .delete(alertRule)
    .where(and(eq(alertRule.projectId, projectId), eq(alertRule.id, ruleId)))
    .returning({ id: alertRule.id });
  return rows.length > 0;
}

export async function resolveRuleIncidents(
  db: LensPostgres,
  projectId: string,
  ruleId: string,
  resolution: string,
  now = new Date(),
): Promise<void> {
  await db
    .update(alertIncident)
    .set({ status: "resolved", resolvedAt: now, resolution })
    .where(
      and(
        eq(alertIncident.projectId, projectId),
        eq(alertIncident.ruleId, ruleId),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    );
}

export async function listAlertIncidents(
  db: LensPostgres,
  projectId: string,
  options: {
    status?: "active" | "resolved";
    kind?: AlertRuleKind;
    page?: number;
    pageSize?: number;
  },
): Promise<Page<AlertIncident>> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = [25, 50, 100].includes(options.pageSize ?? 50) ? (options.pageSize ?? 50) : 50;
  const conditions = [eq(alertIncident.projectId, projectId)];
  if (options.status === "active")
    conditions.push(inArray(alertIncident.status, ["open", "acknowledged"]));
  if (options.status === "resolved") conditions.push(eq(alertIncident.status, "resolved"));
  if (options.kind !== undefined) conditions.push(eq(alertIncident.kind, options.kind));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(alertIncident)
      .where(where)
      .orderBy(desc(alertIncident.lastTriggeredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(alertIncident).where(where),
  ]);
  const names = await userNames(
    db,
    rows
      .flatMap((row) => [row.acknowledgedBy, row.resolvedBy])
      .filter((id): id is string => id !== null),
  );
  const total = Number(totals[0]?.total ?? 0);
  return {
    items: rows.map((row) => incidentFromRow(row, names)),
    total,
    page,
    pageSize,
    pageCount: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function activeAlertCount(db: LensPostgres, projectId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(alertIncident)
    .where(
      and(
        eq(alertIncident.projectId, projectId),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getAlertIncident(
  db: LensPostgres,
  projectId: string,
  incidentId: string,
): Promise<{ incident: AlertIncident; rule: AlertRuleInput | null } | undefined> {
  const [row] = await db
    .select()
    .from(alertIncident)
    .where(and(eq(alertIncident.projectId, projectId), eq(alertIncident.id, incidentId)))
    .limit(1);
  if (row === undefined) return undefined;
  const names = await userNames(
    db,
    [row.acknowledgedBy, row.resolvedBy].filter((id): id is string => id !== null),
  );
  return { incident: incidentFromRow(row, names), rule: row.ruleSnapshot };
}

export async function acknowledgeAlertIncident(
  db: LensPostgres,
  projectId: string,
  incidentId: string,
  userId: string,
  now = new Date(),
): Promise<AlertIncident | undefined> {
  const [row] = await db
    .update(alertIncident)
    .set({ status: "acknowledged", acknowledgedAt: now, acknowledgedBy: userId })
    .where(
      and(
        eq(alertIncident.projectId, projectId),
        eq(alertIncident.id, incidentId),
        eq(alertIncident.status, "open"),
      ),
    )
    .returning();
  return row === undefined ? undefined : incidentFromRow(row, await userNames(db, [userId]));
}

export async function resolveAlertIncident(
  db: LensPostgres,
  projectId: string,
  incidentId: string,
  userId: string,
  now = new Date(),
): Promise<AlertIncident | undefined> {
  const [row] = await db
    .update(alertIncident)
    .set({ status: "resolved", resolvedAt: now, resolvedBy: userId, resolution: "manual" })
    .where(
      and(
        eq(alertIncident.projectId, projectId),
        eq(alertIncident.id, incidentId),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    )
    .returning();
  if (row === undefined) return undefined;
  if (row.ruleId !== null) {
    await db
      .update(alertRule)
      .set({ consecutiveBreaches: 0, cooldownUntil: new Date(now.getTime() + 30 * 60_000) })
      .where(
        and(
          eq(alertRule.id, row.ruleId),
          inArray(alertRule.kind, ["trace_error_rate", "trace_p95_latency_ms", "tool_error_rate"]),
        ),
      );
  }
  return incidentFromRow(row, await userNames(db, [userId]));
}

export async function openAlertIncident(
  db: LensPostgres,
  rule: StoredAlertRule,
  input: {
    subjectKey: string;
    summary: string;
    observedValue?: number;
    sampleCount?: number;
    evidence?: AlertIncidentEvidence;
  },
  now = new Date(),
): Promise<{ incidentId: string | null; created: boolean }> {
  const [active] = await db
    .select({ id: alertIncident.id })
    .from(alertIncident)
    .where(
      and(
        eq(alertIncident.ruleId, rule.id),
        eq(alertIncident.subjectKey, input.subjectKey),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);
  if (active) {
    await db
      .update(alertIncident)
      .set({
        summary: input.summary,
        observedValue: input.observedValue?.toString(),
        threshold: thresholdFor(rule)?.toString(),
        sampleCount: input.sampleCount,
        evidence: input.evidence ?? {},
        lastTriggeredAt: now,
      })
      .where(eq(alertIncident.id, active.id));
    return { incidentId: active.id, created: false };
  }
  const rows = await db
    .insert(alertIncident)
    .values({
      projectId: rule.projectId,
      ruleId: rule.id,
      ruleName: rule.name,
      kind: rule.kind,
      subjectKey: input.subjectKey,
      summary: input.summary,
      observedValue: input.observedValue?.toString(),
      threshold: thresholdFor(rule)?.toString(),
      sampleCount: input.sampleCount,
      evidence: input.evidence ?? {},
      ruleSnapshot: alertRuleSnapshot(rule),
      firstTriggeredAt: now,
      lastTriggeredAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: alertIncident.id });
  const [row] = rows;
  if (row) return { incidentId: row.id, created: true };
  // Unique-index race on alert_incidents_active_subject_idx: another request opened it.
  const [winner] = await db
    .select({ id: alertIncident.id })
    .from(alertIncident)
    .where(
      and(
        eq(alertIncident.ruleId, rule.id),
        eq(alertIncident.subjectKey, input.subjectKey),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);
  return { incidentId: winner?.id ?? null, created: false };
}

export async function autoResolveAlertIncident(
  db: LensPostgres,
  ruleId: string,
  subjectKey: string,
  resolution: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(alertIncident)
    .set({ status: "resolved", resolvedAt: now, resolution })
    .where(
      and(
        eq(alertIncident.ruleId, ruleId),
        eq(alertIncident.subjectKey, subjectKey),
        inArray(alertIncident.status, ["open", "acknowledged"]),
      ),
    )
    .returning({ id: alertIncident.id });
  return rows.length > 0;
}

export async function updateAlertRuleState(
  db: LensPostgres,
  ruleId: string,
  state: { consecutiveBreaches: number; lastEvaluatedAt: Date; cooldownUntil?: Date | null },
): Promise<void> {
  await db.update(alertRule).set(state).where(eq(alertRule.id, ruleId));
}

async function userNames(db: LensPostgres, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, unique));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function ruleValues(input: AlertRuleInput) {
  return {
    name: input.name,
    kind: input.kind,
    enabled: input.enabled,
    threshold: "threshold" in input ? input.threshold.toString() : null,
    windowMinutes: "windowMinutes" in input ? input.windowMinutes : null,
    minimumSamples: "minimumSamples" in input ? input.minimumSamples : null,
    environment: "environment" in input ? (input.environment ?? null) : null,
    serviceName: "serviceName" in input ? (input.serviceName ?? null) : null,
    toolName: "toolName" in input ? (input.toolName ?? null) : null,
    qualityGateId: "qualityGateId" in input ? input.qualityGateId : null,
    channelIds: input.channelIds,
  };
}

function ruleFromRow(row: typeof alertRule.$inferSelect): AlertRule {
  const base = {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    channelIds: row.channelIds,
    enabled: row.enabled,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.kind === "failed_quality_gate")
    return { ...base, kind: row.kind, qualityGateId: row.qualityGateId ?? "" };
  if (row.kind === "failed_human_review") {
    return {
      ...base,
      kind: row.kind,
      environment: row.environment ?? undefined,
      serviceName: row.serviceName ?? undefined,
    };
  }
  const threshold = Number(row.threshold ?? 0);
  const common = {
    ...base,
    kind: row.kind,
    threshold,
    windowMinutes: (row.windowMinutes ?? 5) as 5 | 15 | 60,
    minimumSamples: row.minimumSamples ?? 1,
    environment: row.environment ?? undefined,
    serviceName: row.serviceName ?? undefined,
  };
  if (row.kind === "tool_error_rate") {
    return { ...common, kind: row.kind, toolName: row.toolName ?? undefined };
  }
  if (row.kind === "trace_error_rate") return { ...common, kind: row.kind };
  return { ...common, kind: "trace_p95_latency_ms" };
}

function storedRuleFromRow(row: typeof alertRule.$inferSelect): StoredAlertRule {
  return {
    ...ruleFromRow(row),
    consecutiveBreaches: row.consecutiveBreaches,
    cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
  };
}

function thresholdFor(rule: StoredAlertRule): number | undefined {
  return "threshold" in rule ? rule.threshold : undefined;
}

export function alertRuleSnapshot(rule: StoredAlertRule): AlertRuleInput {
  const {
    id: _id,
    projectId: _projectId,
    lastEvaluatedAt: _lastEvaluatedAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    consecutiveBreaches: _consecutiveBreaches,
    cooldownUntil: _cooldownUntil,
    ...input
  } = rule;
  return input;
}

export function incidentFromRow(
  row: typeof alertIncident.$inferSelect,
  names: Map<string, string>,
): AlertIncident {
  const person = (id: string | null) =>
    id === null ? null : { id, name: names.get(id) ?? "Unknown user" };
  return {
    id: row.id,
    projectId: row.projectId,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    observedValue: row.observedValue === null ? null : Number(row.observedValue),
    threshold: row.threshold === null ? null : Number(row.threshold),
    sampleCount: row.sampleCount,
    evidence: row.evidence,
    firstTriggeredAt: row.firstTriggeredAt.toISOString(),
    lastTriggeredAt: row.lastTriggeredAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: person(row.acknowledgedBy),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: person(row.resolvedBy),
    resolution: row.resolution,
  };
}
