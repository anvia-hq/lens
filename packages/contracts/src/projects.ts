import { z } from "zod";
import { deleteDataJobSchema } from "./data-deletions.js";

export const reconcileRetentionJobSchema = z.object({ projectId: z.uuid() });
export type ReconcileRetentionJob = z.infer<typeof reconcileRetentionJobSchema>;

export const deleteProjectTelemetryJobSchema = z.object({ projectId: z.uuid() });
export type DeleteProjectTelemetryJob = z.infer<typeof deleteProjectTelemetryJobSchema>;

export const recalculateModelCostsJobSchema = z.object({ recalculationId: z.uuid() });
export type RecalculateModelCostsJob = z.infer<typeof recalculateModelCostsJobSchema>;

export const jobOutboxEventSchema = z.discriminatedUnion("name", [
  z.object({
    queue: z.literal("maintenance"),
    name: z.literal("reconcile-retention"),
    payload: reconcileRetentionJobSchema,
  }),
  z.object({
    queue: z.literal("maintenance"),
    name: z.literal("delete-project"),
    payload: deleteProjectTelemetryJobSchema,
  }),
  z.object({
    queue: z.literal("maintenance"),
    name: z.literal("delete-data"),
    payload: deleteDataJobSchema,
  }),
  z.object({
    queue: z.literal("costs"),
    name: z.literal("recalculate-model-costs"),
    payload: recalculateModelCostsJobSchema,
  }),
]);
export type JobOutboxEvent = z.infer<typeof jobOutboxEventSchema>;

export type LlmModelPriceSnapshot = {
  model: string;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number;
};

export type LlmModel = {
  id: string | null;
  model: string;
  observed: boolean;
  inputPricePerMillion: number | null;
  cachedInputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  updatedAt: string | null;
};

export type CostRecalculationStatus = "queued" | "running" | "completed" | "failed";

export type CostRecalculation = {
  id: string;
  status: CostRecalculationStatus;
  from: string | null;
  to: string | null;
  requestedBy: { id: string; name: string; email: string };
  affectedSpans: number | null;
  affectedTraces: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type LlmModelsResponse = {
  items: LlmModel[];
};

export type CostRecalculationsResponse = {
  recalculations: CostRecalculation[];
  hasActiveRecalculation: boolean;
};

export type ProjectSettings = {
  retentionDays: 7 | 30 | 90 | null;
};

export type Project = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  state: "active" | "deleting";
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
};

export type ProjectApiKey = {
  id: string;
  projectId: string;
  name: string;
  publicKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedProjectApiKey = ProjectApiKey & {
  secretKey: string;
};

export type ProjectMcpToken = {
  id: string;
  projectId: string;
  name: string;
  tokenPrefix: string;
  allowRawPayloads: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedProjectMcpToken = ProjectMcpToken & {
  token: string;
};

export const projectSettingsSchema = z.object({
  retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createMcpTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  allowRawPayloads: z.boolean().default(false),
  expiresAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export type CreateMcpTokenInput = z.infer<typeof createMcpTokenSchema>;
