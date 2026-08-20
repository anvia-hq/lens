import type {
  AlertIncidentEvidence,
  AlertRuleInput,
  AlertRuleKind,
  DataDeletionEntityType,
  DataDeletionStatus,
  JobOutboxEvent,
  JsonValue,
  ManagedDatasetCaseInput,
  QualityGateRule,
} from "@lens/contracts";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const member = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("members_org_user_idx").on(table.organizationId, table.userId),
    uniqueIndex("members_user_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("invitations_org_idx").on(table.organizationId)],
);

export const projectState = pgEnum("project_state", ["active", "deleting"]);

export const project = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    state: projectState("state").notNull().default("active"),
    retentionDays: text("retention_days").notNull().default("30"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_org_slug_idx").on(table.organizationId, table.slug),
    index("projects_org_idx").on(table.organizationId),
  ],
);

export const projectApiKey = pgTable(
  "project_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull().unique(),
    secretHash: text("secret_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("project_api_keys_project_idx").on(table.projectId)],
);

export const qualityGate = pgTable(
  "quality_gates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    suiteName: text("suite_name").notNull(),
    environment: text("environment").notNull(),
    minimumCaseCount: integer("minimum_case_count").notNull().default(1),
    rules: jsonb("rules").$type<QualityGateRule[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quality_gates_project_name_idx").on(table.projectId, table.name),
    index("quality_gates_project_suite_idx").on(
      table.projectId,
      table.suiteName,
      table.environment,
    ),
  ],
);

export const alertIncidentStatus = pgEnum("alert_incident_status", [
  "open",
  "acknowledged",
  "resolved",
]);

export const alertRule = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<AlertRuleKind>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    threshold: numeric("threshold", { precision: 24, scale: 8 }),
    windowMinutes: integer("window_minutes"),
    minimumSamples: integer("minimum_samples"),
    environment: text("environment"),
    serviceName: text("service_name"),
    toolName: text("tool_name"),
    qualityGateId: uuid("quality_gate_id").references(() => qualityGate.id),
    consecutiveBreaches: integer("consecutive_breaches").notNull().default(0),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("alert_rules_project_name_idx").on(table.projectId, sql`lower(${table.name})`),
    index("alert_rules_project_enabled_idx").on(table.projectId, table.enabled),
    index("alert_rules_gate_idx").on(table.qualityGateId),
  ],
);

export const alertIncident = pgTable(
  "alert_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => alertRule.id, { onDelete: "set null" }),
    ruleName: text("rule_name").notNull(),
    kind: text("kind").$type<AlertRuleKind>().notNull(),
    subjectKey: text("subject_key").notNull(),
    status: alertIncidentStatus("status").notNull().default("open"),
    summary: text("summary").notNull(),
    observedValue: numeric("observed_value", { precision: 24, scale: 8 }),
    threshold: numeric("threshold", { precision: 24, scale: 8 }),
    sampleCount: integer("sample_count"),
    evidence: jsonb("evidence").$type<AlertIncidentEvidence>().notNull().default({}),
    ruleSnapshot: jsonb("rule_snapshot").$type<AlertRuleInput>(),
    firstTriggeredAt: timestamp("first_triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: text("acknowledged_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolution: text("resolution"),
  },
  (table) => [
    uniqueIndex("alert_incidents_active_subject_idx")
      .on(table.ruleId, table.subjectKey)
      .where(sql`${table.status} in ('open', 'acknowledged') and ${table.ruleId} is not null`),
    index("alert_incidents_project_status_idx").on(
      table.projectId,
      table.status,
      table.lastTriggeredAt,
    ),
  ],
);

export const managedDatasetVersionStatus = pgEnum("managed_dataset_version_status", [
  "draft",
  "published",
]);

export const managedDataset = pgTable(
  "managed_datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, JsonValue>>().notNull().default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("managed_datasets_project_name_idx").on(table.projectId, sql`lower(${table.name})`),
    index("managed_datasets_project_updated_idx").on(table.projectId, table.updatedAt),
  ],
);

export const managedDatasetVersion = pgTable(
  "managed_dataset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => managedDataset.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    status: managedDatasetVersionStatus("status").notNull().default("draft"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("managed_dataset_versions_label_idx").on(
      table.datasetId,
      sql`lower(${table.version})`,
    ),
    uniqueIndex("managed_dataset_versions_single_draft_idx")
      .on(table.datasetId)
      .where(sql`${table.status} = 'draft'`),
    index("managed_dataset_versions_dataset_created_idx").on(table.datasetId, table.createdAt),
  ],
);

export const managedDatasetCase = pgTable(
  "managed_dataset_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => managedDatasetVersion.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    position: integer("position").notNull(),
    item: jsonb("item").$type<ManagedDatasetCaseInput>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("managed_dataset_cases_version_case_idx").on(
      table.versionId,
      sql`lower(${table.caseId})`,
    ),
    index("managed_dataset_cases_version_position_idx").on(table.versionId, table.position),
  ],
);

export const llmModelPrice = pgTable(
  "llm_model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    inputPricePerMillion: numeric("input_price_per_million", {
      precision: 24,
      scale: 12,
    }).notNull(),
    cachedInputPricePerMillion: numeric("cached_input_price_per_million", {
      precision: 24,
      scale: 12,
    }),
    outputPricePerMillion: numeric("output_price_per_million", {
      precision: 24,
      scale: 12,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("llm_model_prices_org_model_idx").on(table.organizationId, table.model),
    index("llm_model_prices_org_idx").on(table.organizationId),
  ],
);

export const costRecalculationStatus = pgEnum("cost_recalculation_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const costRecalculation = pgTable(
  "cost_recalculations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    status: costRecalculationStatus("status").notNull().default("queued"),
    from: timestamp("from", { withTimezone: true }),
    to: timestamp("to", { withTimezone: true }),
    priceSnapshot: jsonb("price_snapshot")
      .$type<
        Array<{
          model: string;
          inputPricePerMillion: number;
          cachedInputPricePerMillion: number | null;
          outputPricePerMillion: number;
        }>
      >()
      .notNull(),
    affectedSpans: text("affected_spans"),
    affectedTraces: text("affected_traces"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("cost_recalculations_org_created_idx").on(table.organizationId, table.createdAt),
    uniqueIndex("cost_recalculations_org_active_idx")
      .on(table.organizationId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const jobOutbox = pgTable(
  "job_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: text("queue").$type<JobOutboxEvent["queue"]>().notNull(),
    name: text("name").$type<JobOutboxEvent["name"]>().notNull(),
    payload: jsonb("payload").$type<JobOutboxEvent["payload"]>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_outbox_available_idx").on(table.availableAt, table.createdAt)],
);

export const dataDeletionRequest = pgTable(
  "data_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    entityType: text("entity_type").$type<DataDeletionEntityType>().notNull(),
    entityIds: jsonb("entity_ids").$type<string[]>().notNull(),
    status: text("status").$type<DataDeletionStatus>().notNull().default("queued"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("data_deletion_requests_project_created_idx").on(table.projectId, table.createdAt),
    index("data_deletion_requests_project_status_idx").on(table.projectId, table.status),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(member),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  projects: many(project),
  llmModelPrices: many(llmModelPrice),
  costRecalculations: many(costRecalculation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
  apiKeys: many(projectApiKey),
  qualityGates: many(qualityGate),
  alertRules: many(alertRule),
  alertIncidents: many(alertIncident),
  managedDatasets: many(managedDataset),
}));

export const projectApiKeyRelations = relations(projectApiKey, ({ one }) => ({
  project: one(project, { fields: [projectApiKey.projectId], references: [project.id] }),
}));

export const qualityGateRelations = relations(qualityGate, ({ one }) => ({
  project: one(project, { fields: [qualityGate.projectId], references: [project.id] }),
}));

export const alertRuleRelations = relations(alertRule, ({ one, many }) => ({
  project: one(project, { fields: [alertRule.projectId], references: [project.id] }),
  qualityGate: one(qualityGate, {
    fields: [alertRule.qualityGateId],
    references: [qualityGate.id],
  }),
  incidents: many(alertIncident),
}));

export const alertIncidentRelations = relations(alertIncident, ({ one }) => ({
  project: one(project, { fields: [alertIncident.projectId], references: [project.id] }),
  rule: one(alertRule, { fields: [alertIncident.ruleId], references: [alertRule.id] }),
  acknowledger: one(user, {
    fields: [alertIncident.acknowledgedBy],
    references: [user.id],
    relationName: "alert_acknowledger",
  }),
  resolver: one(user, {
    fields: [alertIncident.resolvedBy],
    references: [user.id],
    relationName: "alert_resolver",
  }),
}));

export const managedDatasetRelations = relations(managedDataset, ({ one, many }) => ({
  project: one(project, { fields: [managedDataset.projectId], references: [project.id] }),
  creator: one(user, { fields: [managedDataset.createdBy], references: [user.id] }),
  versions: many(managedDatasetVersion),
}));

export const managedDatasetVersionRelations = relations(managedDatasetVersion, ({ one, many }) => ({
  dataset: one(managedDataset, {
    fields: [managedDatasetVersion.datasetId],
    references: [managedDataset.id],
  }),
  creator: one(user, { fields: [managedDatasetVersion.createdBy], references: [user.id] }),
  cases: many(managedDatasetCase),
}));

export const managedDatasetCaseRelations = relations(managedDatasetCase, ({ one }) => ({
  version: one(managedDatasetVersion, {
    fields: [managedDatasetCase.versionId],
    references: [managedDatasetVersion.id],
  }),
}));

export const llmModelPriceRelations = relations(llmModelPrice, ({ one }) => ({
  organization: one(organization, {
    fields: [llmModelPrice.organizationId],
    references: [organization.id],
  }),
}));

export const costRecalculationRelations = relations(costRecalculation, ({ one }) => ({
  organization: one(organization, {
    fields: [costRecalculation.organizationId],
    references: [organization.id],
  }),
  requester: one(user, { fields: [costRecalculation.requestedBy], references: [user.id] }),
}));

export const authSchema = {
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
};
