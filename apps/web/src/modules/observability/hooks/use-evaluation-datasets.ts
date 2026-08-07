import type { EvaluationDatasetDetail, EvaluationDatasetSummary, Page } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
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
  const datasets = useQuery({
    queryKey: ["evaluation-datasets", project.id, search.search, search.page],
    queryFn: () => api<Page<EvaluationDatasetSummary>>(evaluationDatasetsPath(project.id, search)),
  });
  const detail = useQuery({
    queryKey: ["evaluation-dataset", project.id, search.dataset, search.version],
    queryFn: () => api<EvaluationDatasetDetail>(evaluationDatasetDetailPath(project.id, search)),
    enabled: search.dataset !== undefined,
  });
  const setSearch = (changes: Partial<EvaluationDatasetsSearch>) => {
    void navigate({
      to: "/$projectId/evaluations/datasets",
      params: { projectId: project.id },
      search: { ...search, ...changes },
    });
  };
  return { datasets, detail, project, search, setSearch };
}

export type EvaluationDatasetsState = ReturnType<typeof useEvaluationDatasets>;
