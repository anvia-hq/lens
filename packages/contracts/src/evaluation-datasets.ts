import { z } from "zod";
import type {
  EvaluationPayload,
  EvaluationPayloadStatus,
  EvaluationRunSummary,
} from "./evaluations-core.js";
import type { JsonValue } from "./shared.js";

export type EvaluationDatasetSummary = {
  name: string;
  versionCount: number;
  runCount: number;
  latestVersion: string | null;
  latestRunAt: string;
};

export type EvaluationDatasetVersionSummary = {
  version: string | null;
  status: "complete" | "incomplete" | "conflict";
  caseCount: number;
  runCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  canonicalRunId: string | null;
};

export type EvaluationDatasetCase = {
  caseId: string;
  payload: EvaluationPayload | null;
  payloadStatus: EvaluationPayloadStatus;
  conflict: boolean;
};

export type EvaluationDatasetDetail = {
  name: string;
  selectedVersion: EvaluationDatasetVersionSummary;
  versions: EvaluationDatasetVersionSummary[];
  cases: EvaluationDatasetCase[];
  runs: EvaluationRunSummary[];
};

const managedDatasetMetadataSchema = z.record(z.string(), z.json());

export const managedDatasetInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(2_000).optional(),
  metadata: managedDatasetMetadataSchema.optional(),
});
export type ManagedDatasetInput = z.infer<typeof managedDatasetInputSchema>;

export const managedDatasetUpdateSchema = managedDatasetInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one dataset field is required",
  });
export type ManagedDatasetUpdate = z.infer<typeof managedDatasetUpdateSchema>;

export const managedDatasetVersionInputSchema = z.object({
  version: z.string().trim().min(1).max(80),
});
export type ManagedDatasetVersionInput = z.infer<typeof managedDatasetVersionInputSchema>;

export const managedDatasetCaseInputSchema = z.object({
  id: z.string().trim().min(1).max(128),
  input: z.json(),
  expected: z.json().optional(),
  context: z.array(z.string()).max(1_000).optional(),
  retrievalContext: z.array(z.string()).max(1_000).optional(),
  metadata: managedDatasetMetadataSchema.optional(),
});
export type ManagedDatasetCaseInput = z.infer<typeof managedDatasetCaseInputSchema>;

export const managedDatasetCaseImportSchema = z
  .object({ items: z.array(managedDatasetCaseInputSchema).min(1).max(10_000) })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      const key = item.id.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Duplicate case ID: ${item.id}`,
        });
      }
      seen.add(key);
    }
  });
export type ManagedDatasetCaseImport = z.infer<typeof managedDatasetCaseImportSchema>;

export const managedDatasetObservedImportSchema = managedDatasetInputSchema.extend({
  sourceName: z.string().trim().min(1).max(128),
  sourceVersion: z.string().trim().max(80).nullable(),
  version: z.string().trim().min(1).max(80),
});
export type ManagedDatasetObservedImport = z.infer<typeof managedDatasetObservedImportSchema>;

export type ManagedDatasetVersionStatus = "draft" | "published";

export type ManagedDatasetVersion = {
  id: string;
  datasetId: string;
  version: string;
  status: ManagedDatasetVersionStatus;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ManagedDatasetSummary = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  metadata: Record<string, JsonValue>;
  draft: ManagedDatasetVersion | null;
  latestPublished: ManagedDatasetVersion | null;
  versionCount: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManagedDatasetDetail = ManagedDatasetSummary & { versions: ManagedDatasetVersion[] };

export type ManagedDatasetVersionDetail = ManagedDatasetVersion & {
  dataset: Omit<ManagedDatasetSummary, "draft" | "latestPublished" | "versionCount">;
  items: ManagedDatasetCaseInput[];
};
