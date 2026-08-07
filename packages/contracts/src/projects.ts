import { z } from "zod";

export type ReconcileRetentionJob = {
  projectId: string;
  retentionDays: number | null;
};

export type DeleteProjectTelemetryJob = {
  projectId: string;
};

export type RecalculateModelCostsJob = {
  recalculationId: string;
};

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
