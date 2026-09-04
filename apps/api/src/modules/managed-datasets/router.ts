import {
  type EvaluationDatasetCase,
  type ManagedDatasetCaseInput,
  managedDatasetCaseImportSchema,
  managedDatasetCaseInputSchema,
  managedDatasetInputSchema,
  managedDatasetObservedImportSchema,
  managedDatasetUpdateSchema,
  managedDatasetVersionInputSchema,
} from "@lens/contracts";
import {
  archiveManagedDataset,
  createManagedDataset,
  createManagedDatasetVersion,
  createManagedDatasetWithCases,
  deleteManagedDatasetCase,
  getEvaluationDatasetDetail,
  getManagedDataset,
  getManagedDatasetVersion,
  importManagedDatasetCases,
  listManagedDatasets,
  publishManagedDatasetVersion,
  updateManagedDataset,
  upsertManagedDatasetCase,
} from "@lens/db";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createManagedDatasetsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/managed-datasets", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listManagedDatasets(deps.postgres.db, access.project.id) });
    })
    .post(
      "/:projectId/managed-datasets",
      jsonInput(managedDatasetInputSchema, "invalid_dataset", "Invalid dataset"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        try {
          return c.json(
            await createManagedDataset(
              deps.postgres.db,
              access.project.id,
              requiredSession(c).user.id,
              parsed,
            ),
            201,
          );
        } catch (error) {
          return duplicateOrThrow(c, error, "A dataset with this name already exists");
        }
      },
    )
    .post(
      "/:projectId/managed-datasets/import-observed",
      jsonInput(
        managedDatasetObservedImportSchema,
        "invalid_import",
        "Invalid observed dataset import",
      ),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        const observed = await getEvaluationDatasetDetail(
          deps.clickhouse,
          access.project.id,
          parsed.sourceName,
          parsed.sourceVersion,
        );
        if (observed === undefined) {
          return apiError(c, 404, "not_found", "Observed dataset version was not found");
        }
        if (observed.selectedVersion.status !== "complete") {
          return apiError(
            c,
            409,
            "observed_dataset_incomplete",
            "Only complete, conflict-free observed versions can be imported",
          );
        }
        const items = observed.cases.map(observedCaseInput);
        if (items.some((item) => item === undefined)) {
          return apiError(
            c,
            409,
            "observed_dataset_incomplete",
            "Every observed case must have a captured payload",
          );
        }
        const { sourceName: _, sourceVersion: __, version, ...input } = parsed;
        try {
          return c.json(
            await createManagedDatasetWithCases(
              deps.postgres.db,
              access.project.id,
              requiredSession(c).user.id,
              input,
              version,
              items as ManagedDatasetCaseInput[],
            ),
            201,
          );
        } catch (error) {
          return duplicateOrThrow(c, error, "A dataset with this name already exists");
        }
      },
    )
    .get("/:projectId/managed-datasets/:datasetId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const dataset = await getManagedDataset(
        deps.postgres.db,
        access.project.id,
        c.req.param("datasetId"),
      );
      return dataset === undefined
        ? apiError(c, 404, "not_found", "Managed dataset not found")
        : c.json(dataset);
    })
    .patch(
      "/:projectId/managed-datasets/:datasetId",
      jsonInput(managedDatasetUpdateSchema, "invalid_dataset", "Invalid dataset update"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        try {
          const dataset = await updateManagedDataset(
            deps.postgres.db,
            access.project.id,
            c.req.param("datasetId"),
            parsed,
          );
          return dataset === undefined
            ? apiError(c, 404, "not_found", "Managed dataset not found")
            : c.json(dataset);
        } catch (error) {
          return duplicateOrThrow(c, error, "A dataset with this name already exists");
        }
      },
    )
    .delete("/:projectId/managed-datasets/:datasetId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const archived = await archiveManagedDataset(
        deps.postgres.db,
        access.project.id,
        c.req.param("datasetId"),
      );
      return archived
        ? c.body(null, 204)
        : apiError(c, 404, "not_found", "Managed dataset not found");
    })
    .post(
      "/:projectId/managed-datasets/:datasetId/versions",
      jsonInput(managedDatasetVersionInputSchema, "invalid_version", "Invalid version label"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        try {
          const version = await createManagedDatasetVersion(
            deps.postgres.db,
            access.project.id,
            c.req.param("datasetId"),
            requiredSession(c).user.id,
            parsed.version,
          );
          return version === undefined
            ? apiError(c, 404, "not_found", "Managed dataset not found")
            : c.json(version, 201);
        } catch (error) {
          return duplicateOrThrow(c, error, "A draft or version with this label already exists");
        }
      },
    )
    .get("/:projectId/managed-datasets/:datasetId/versions/:versionId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const version = await versionFor(c, deps, access.project.id);
      return version === undefined
        ? apiError(c, 404, "not_found", "Managed dataset version not found")
        : c.json(version);
    })
    .post(
      "/:projectId/managed-datasets/:datasetId/versions/:versionId/cases",
      jsonInput(managedDatasetCaseInputSchema, "invalid_case", "Invalid dataset case"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        const state = await requireDraft(c, deps, access.project.id);
        if (state !== undefined) return state;
        const version = await upsertManagedDatasetCase(
          deps.postgres.db,
          access.project.id,
          c.req.param("datasetId"),
          c.req.param("versionId"),
          parsed,
        );
        return version === undefined
          ? apiError(c, 404, "not_found", "Managed dataset version not found")
          : c.json(version);
      },
    )
    .post(
      "/:projectId/managed-datasets/:datasetId/versions/:versionId/cases/import",
      jsonInput(managedDatasetCaseImportSchema, "invalid_import", "Invalid case import"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        const state = await requireDraft(c, deps, access.project.id);
        if (state !== undefined) return state;
        const version = await importManagedDatasetCases(
          deps.postgres.db,
          access.project.id,
          c.req.param("datasetId"),
          c.req.param("versionId"),
          parsed.items,
        );
        return version === undefined
          ? apiError(c, 404, "not_found", "Managed dataset version not found")
          : c.json(version);
      },
    )
    .delete(
      "/:projectId/managed-datasets/:datasetId/versions/:versionId/cases/:caseId",
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const state = await requireDraft(c, deps, access.project.id);
        if (state !== undefined) return state;
        const deleted = await deleteManagedDatasetCase(
          deps.postgres.db,
          access.project.id,
          c.req.param("datasetId"),
          c.req.param("versionId"),
          c.req.param("caseId"),
        );
        return deleted
          ? c.body(null, 204)
          : apiError(c, 404, "not_found", "Dataset case not found");
      },
    )
    .post("/:projectId/managed-datasets/:datasetId/versions/:versionId/publish", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const state = await requireDraft(c, deps, access.project.id);
      if (state !== undefined) return state;
      const version = await publishManagedDatasetVersion(
        deps.postgres.db,
        access.project.id,
        c.req.param("datasetId"),
        c.req.param("versionId"),
      );
      if (version === "empty") {
        return apiError(c, 409, "empty_dataset", "A version must contain at least one case");
      }
      return version === undefined
        ? apiError(c, 404, "not_found", "Managed dataset version not found")
        : c.json(version);
    });

async function accessFor(c: Parameters<typeof requiredSession>[0], deps: ApiDependencies) {
  return requireProjectAccess(
    deps.postgres.db,
    c.req.param("projectId") ?? "",
    requiredSession(c).user.id,
  );
}

async function versionFor(
  c: Parameters<typeof requiredSession>[0],
  deps: ApiDependencies,
  projectId: string,
) {
  return getManagedDatasetVersion(
    deps.postgres.db,
    projectId,
    c.req.param("datasetId") ?? "",
    c.req.param("versionId") ?? "",
  );
}

async function requireDraft(
  c: Parameters<typeof requiredSession>[0],
  deps: ApiDependencies,
  projectId: string,
) {
  const version = await versionFor(c, deps, projectId);
  if (version === undefined)
    return apiError(c, 404, "not_found", "Managed dataset version not found");
  if (version.status !== "draft") {
    return apiError(c, 409, "immutable_version", "Published dataset versions are immutable");
  }
  return undefined;
}

function adminRequired(c: Parameters<typeof apiError>[0]) {
  return apiError(c, 403, "forbidden", "Admin access is required");
}

function duplicateOrThrow(c: Parameters<typeof apiError>[0], error: unknown, message: string) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return apiError(c, 409, "duplicate_dataset", message);
  }
  throw error;
}

function observedCaseInput(observed: EvaluationDatasetCase): ManagedDatasetCaseInput | undefined {
  const payload = observed.payload;
  if (payload === null) return undefined;
  const item: ManagedDatasetCaseInput = { id: observed.caseId, input: payload.input };
  if (payload.expected !== undefined) item.expected = payload.expected;
  if (isStringArray(payload.context)) item.context = payload.context;
  if (isStringArray(payload.retrievalContext)) item.retrievalContext = payload.retrievalContext;
  return item;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
