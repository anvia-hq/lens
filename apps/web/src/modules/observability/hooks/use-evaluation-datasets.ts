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
  search: Pick<EvaluationDatasetsSearch, "dataset" | "version">,
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
  const detail = useQuery({
    queryKey: ["evaluation-dataset", project.id, search.dataset, search.version],
    queryFn: () => api<EvaluationDatasetDetail>(evaluationDatasetDetailPath(project.id, search)),
    enabled: search.tab === "observed" && search.dataset !== undefined,
  });
  const managed = useQuery({
    queryKey: ["managed-datasets", project.id],
    queryFn: () => api<{ items: ManagedDatasetSummary[] }>(base),
    enabled: search.tab !== "observed",
  });
  const managedDetail = useQuery({
    queryKey: ["managed-dataset", project.id, search.managedDataset],
    queryFn: () => api<ManagedDatasetDetail>(`${base}/${search.managedDataset}`),
    enabled: search.tab !== "observed" && search.managedDataset !== undefined,
  });
  const selectedVersionId =
    search.managedVersion ??
    managedDetail.data?.draft?.id ??
    managedDetail.data?.latestPublished?.id ??
    managedDetail.data?.versions[0]?.id;
  const managedVersion = useQuery({
    queryKey: ["managed-dataset-version", project.id, search.managedDataset, selectedVersionId],
    queryFn: () =>
      api<ManagedDatasetVersionDetail>(
        `${base}/${search.managedDataset}/versions/${selectedVersionId}`,
      ),
    enabled:
      search.tab !== "observed" &&
      search.managedDataset !== undefined &&
      selectedVersionId !== undefined,
  });
  const linkedRuns = useQuery({
    queryKey: [
      "managed-dataset-runs",
      project.id,
      managedVersion.data?.dataset.name,
      managedVersion.data?.version,
    ],
    queryFn: () =>
      api<EvaluationDatasetDetail>(
        evaluationDatasetDetailPath(project.id, {
          dataset: managedVersion.data?.dataset.name,
          version: managedVersion.data?.version,
        }),
      ),
    enabled: managedVersion.data?.status === "published",
    retry: false,
  });

  const createDataset = useMutation({
    mutationFn: (input: ManagedDatasetInput) =>
      api<ManagedDatasetDetail>(base, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (dataset) => {
      await refreshManaged();
      setSearch({
        tab: "managed",
        managedDataset: dataset.id,
        managedVersion: dataset.draft?.id,
      });
    },
  });
  const createVersion = useMutation({
    mutationFn: (args: { datasetId: string; version: string }) =>
      api<ManagedDatasetVersionDetail>(`${base}/${args.datasetId}/versions`, {
        method: "POST",
        body: JSON.stringify({ version: args.version }),
      }),
    onSuccess: async (version) => {
      await refreshManaged();
      await queryClient.invalidateQueries({
        queryKey: ["managed-dataset", project.id, version.datasetId],
      });
      setSearch({ managedDataset: version.datasetId, managedVersion: version.id });
    },
  });
  const upsertCase = useMutation({
    mutationFn: (args: { datasetId: string; versionId: string; item: ManagedDatasetCaseInput }) =>
      api<ManagedDatasetVersionDetail>(
        `${base}/${args.datasetId}/versions/${args.versionId}/cases`,
        { method: "POST", body: JSON.stringify(args.item) },
      ),
    onSuccess: refreshVersionQueries,
  });
  const importCases = useMutation({
    mutationFn: (args: {
      datasetId: string;
      versionId: string;
      items: ManagedDatasetCaseInput[];
    }) =>
      api<ManagedDatasetVersionDetail>(
        `${base}/${args.datasetId}/versions/${args.versionId}/cases/import`,
        { method: "POST", body: JSON.stringify({ items: args.items }) },
      ),
    onSuccess: refreshVersionQueries,
  });
  const deleteCase = useMutation({
    mutationFn: (args: { datasetId: string; versionId: string; caseId: string }) =>
      api<void>(
        `${base}/${args.datasetId}/versions/${args.versionId}/cases/${encodeURIComponent(args.caseId)}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await refreshVersionQueries();
    },
  });
  const publishVersion = useMutation({
    mutationFn: (args: { datasetId: string; versionId: string }) =>
      api<ManagedDatasetVersionDetail>(
        `${base}/${args.datasetId}/versions/${args.versionId}/publish`,
        { method: "POST" },
      ),
    onSuccess: refreshVersionQueries,
  });
  const archiveDataset = useMutation({
    mutationFn: (datasetId: string) => api<void>(`${base}/${datasetId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshManaged();
      setSearch({ managedDataset: undefined, managedVersion: undefined });
    },
  });
  const importObserved = useMutation({
    mutationFn: (input: ManagedDatasetObservedImport) =>
      api<ManagedDatasetDetail>(`${base}/import-observed`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (dataset) => {
      await refreshManaged();
      setSearch({
        tab: "managed",
        managedDataset: dataset.id,
        managedVersion: dataset.draft?.id,
        dataset: undefined,
        version: undefined,
      });
    },
  });

  async function refreshVersionQueries() {
    await Promise.all([
      refreshManaged(),
      queryClient.invalidateQueries({
        queryKey: ["managed-dataset", project.id, search.managedDataset],
      }),
      queryClient.invalidateQueries({
        queryKey: ["managed-dataset-version", project.id, search.managedDataset],
      }),
    ]);
  }

  return {
    archiveDataset,
    createDataset,
    createVersion,
    datasets,
    deleteCase,
    detail,
    importCases,
    importObserved,
    linkedRuns,
    managed,
    managedDetail,
    managedVersion,
    project,
    publishVersion,
    search,
    selectedVersionId,
    setSearch,
    upsertCase,
  };
}

export type EvaluationDatasetsState = ReturnType<typeof useEvaluationDatasets>;
