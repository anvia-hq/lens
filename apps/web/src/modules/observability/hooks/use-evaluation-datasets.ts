import type {
  EvaluationDatasetDetail,
  EvaluationDatasetSummary,
  ManagedDatasetCaseInput,
  ManagedDatasetDetail,
  ManagedDatasetInput,
  ManagedDatasetObservedImport,
  ManagedDatasetSummary,
  ManagedDatasetVersionDetail,
  Page,
} from "@lens/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { api, queryString } from "../../../lib/api";
import type { EvaluationDatasetsSearch } from "../types";
import { useObservabilityProject } from "./use-observability-project";

export const UNVERSIONED_DATASET = "__unversioned__";

export function evaluationDatasetsPath(
  projectId: string,
  search: Pick<EvaluationDatasetsSearch, "search" | "page">,
): string {
  return `/api/v1/projects/${projectId}/evaluation-datasets?${queryString({
    search: search.search,
    page: search.page,
    pageSize: 25,
  })}`;
}

export function evaluationDatasetDetailPath(
  projectId: string,
  search: { dataset?: string; version?: string },
): string {
  return `/api/v1/projects/${projectId}/evaluation-datasets/detail?${queryString({
    name: search.dataset,
    version: search.version === UNVERSIONED_DATASET ? undefined : search.version,
    unversioned: search.version === UNVERSIONED_DATASET ? 1 : undefined,
  })}`;
}

export function useEvaluationDatasets() {
  const { project } = useObservabilityProject();
  const search = useSearch({ from: "/$projectId/evaluations/datasets" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/api/v1/projects/${project.id}/managed-datasets`;
  const setSearch = (changes: Partial<EvaluationDatasetsSearch>) => {
    void navigate({
      to: "/$projectId/evaluations/datasets",
      params: { projectId: project.id },
      search: { ...search, ...changes },
    });
  };
  const refreshManaged = () =>
    queryClient.invalidateQueries({ queryKey: ["managed-datasets", project.id] });
  const datasets = useQuery({
    queryKey: ["evaluation-datasets", project.id, search.search, search.page],
    queryFn: () => api<Page<EvaluationDatasetSummary>>(evaluationDatasetsPath(project.id, search)),
    enabled: search.tab === "observed",
  });
  const managed = useQuery({
    queryKey: ["managed-datasets", project.id],
    queryFn: () => api<{ items: ManagedDatasetSummary[] }>(base),
    enabled: search.tab !== "observed",
  });
  const createDataset = useMutation({
    mutationFn: (input: ManagedDatasetInput) =>
      api<ManagedDatasetDetail>(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (dataset) => {
      await refreshManaged();
      void navigate({
        to: "/$projectId/evaluations/datasets/managed/$datasetId",
        params: { projectId: project.id, datasetId: dataset.id },
        search: { version: dataset.draft?.id },
      });
    },
  });

  return {
    createDataset,
    datasets,
    managed,
    project,
    search,
    setSearch,
    openManagedDataset(datasetId: string, version?: string) {
      void navigate({
        to: "/$projectId/evaluations/datasets/managed/$datasetId",
        params: { projectId: project.id, datasetId },
        search: { version },
      });
    },
    openObservedDataset(dataset: string) {
      void navigate({
        to: "/$projectId/evaluations/datasets/observed/$datasetName",
        params: { projectId: project.id, datasetName: dataset },
        search: {},
      });
    },
  };
}

export function useManagedDatasetDetail(datasetId: string) {
  const { project } = useObservabilityProject();
  const search = useSearch({
    from: "/$projectId/evaluations/datasets_/managed/$datasetId",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/api/v1/projects/${project.id}/managed-datasets`;
  const refreshManaged = () =>
    queryClient.invalidateQueries({ queryKey: ["managed-datasets", project.id] });
  const detail = useQuery({
    queryKey: ["managed-dataset", project.id, datasetId],
    queryFn: () => api<ManagedDatasetDetail>(`${base}/${datasetId}`),
  });
  const selectedVersionId =
    search.version ??
    detail.data?.draft?.id ??
    detail.data?.latestPublished?.id ??
    detail.data?.versions[0]?.id;
  const version = useQuery({
    queryKey: ["managed-dataset-version", project.id, datasetId, selectedVersionId],
    queryFn: () =>
      api<ManagedDatasetVersionDetail>(`${base}/${datasetId}/versions/${selectedVersionId}`),
    enabled: selectedVersionId !== undefined,
  });
  const linkedRuns = useQuery({
    queryKey: [
      "managed-dataset-runs",
      project.id,
      version.data?.dataset.name,
      version.data?.version,
    ],
    queryFn: () =>
      api<EvaluationDatasetDetail>(
        evaluationDatasetDetailPath(project.id, {
          dataset: version.data?.dataset.name,
          version: version.data?.version,
        }),
      ),
    enabled: version.data?.status === "published",
    retry: false,
  });
  const setVersion = (versionId: string) => {
    void navigate({
      to: "/$projectId/evaluations/datasets/managed/$datasetId",
      params: { projectId: project.id, datasetId },
      search: { version: versionId },
      replace: true,
    });
  };
  const refreshVersionQueries = async () => {
    await Promise.all([
      refreshManaged(),
      queryClient.invalidateQueries({ queryKey: ["managed-dataset", project.id, datasetId] }),
      queryClient.invalidateQueries({
        queryKey: ["managed-dataset-version", project.id, datasetId],
      }),
    ]);
  };
  const createVersion = useMutation({
    mutationFn: (versionLabel: string) =>
      api<ManagedDatasetVersionDetail>(`${base}/${datasetId}/versions`, {
        method: "POST",
        body: JSON.stringify({ version: versionLabel }),
      }),
    onSuccess: async (created) => {
      await refreshVersionQueries();
      setVersion(created.id);
    },
  });
  const upsertCase = useMutation({
    mutationFn: (args: { versionId: string; item: ManagedDatasetCaseInput }) =>
      api<ManagedDatasetVersionDetail>(`${base}/${datasetId}/versions/${args.versionId}/cases`, {
        method: "POST",
        body: JSON.stringify(args.item),
      }),
    onSuccess: refreshVersionQueries,
  });
  const importCases = useMutation({
    mutationFn: (args: { versionId: string; items: ManagedDatasetCaseInput[] }) =>
      api<ManagedDatasetVersionDetail>(
        `${base}/${datasetId}/versions/${args.versionId}/cases/import`,
        { method: "POST", body: JSON.stringify({ items: args.items }) },
      ),
    onSuccess: refreshVersionQueries,
  });
  const deleteCase = useMutation({
    mutationFn: (args: { versionId: string; caseId: string }) =>
      api<void>(
        `${base}/${datasetId}/versions/${args.versionId}/cases/${encodeURIComponent(args.caseId)}`,
        { method: "DELETE" },
      ),
    onSuccess: refreshVersionQueries,
  });
  const publishVersion = useMutation({
    mutationFn: (versionId: string) =>
      api<ManagedDatasetVersionDetail>(`${base}/${datasetId}/versions/${versionId}/publish`, {
        method: "POST",
      }),
    onSuccess: refreshVersionQueries,
  });
  const archiveDataset = useMutation({
    mutationFn: () => api<void>(`${base}/${datasetId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshManaged();
      void navigate({
        to: "/$projectId/evaluations/datasets",
        params: { projectId: project.id },
        search: { tab: "managed", page: 1 },
      });
    },
  });

  return {
    archiveDataset,
    createVersion,
    deleteCase,
    detail,
    importCases,
    linkedRuns,
    project,
    publishVersion,
    selectedVersionId,
    setVersion,
    upsertCase,
    version,
  };
}

export function useObservedDatasetDetail(datasetName: string) {
  const { project } = useObservabilityProject();
  const search = useSearch({
    from: "/$projectId/evaluations/datasets_/observed/$datasetName",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const base = `/api/v1/projects/${project.id}/managed-datasets`;
  const detail = useQuery({
    queryKey: ["evaluation-dataset", project.id, datasetName, search.version],
    queryFn: () =>
      api<EvaluationDatasetDetail>(
        evaluationDatasetDetailPath(project.id, {
          dataset: datasetName,
          version: search.version,
        }),
      ),
  });
  const importObserved = useMutation({
    mutationFn: (input: ManagedDatasetObservedImport) =>
      api<ManagedDatasetDetail>(`${base}/import-observed`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (dataset) => {
      await queryClient.invalidateQueries({ queryKey: ["managed-datasets", project.id] });
      void navigate({
        to: "/$projectId/evaluations/datasets/managed/$datasetId",
        params: { projectId: project.id, datasetId: dataset.id },
        search: { version: dataset.draft?.id },
      });
    },
  });
  const setVersion = (version: string) => {
    void navigate({
      to: "/$projectId/evaluations/datasets/observed/$datasetName",
      params: { projectId: project.id, datasetName },
      search: { version },
      replace: true,
    });
  };

  return { detail, importObserved, project, search, setVersion };
}

export type EvaluationDatasetsState = ReturnType<typeof useEvaluationDatasets>;
export type ManagedDatasetDetailState = ReturnType<typeof useManagedDatasetDetail>;
export type ObservedDatasetDetailState = ReturnType<typeof useObservedDatasetDetail>;
