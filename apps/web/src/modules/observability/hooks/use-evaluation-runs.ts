import type {
  EvaluationOverview,
  EvaluationRunDetail,
  EvaluationRunFacets,
  EvaluationRunSummary,
  Page,
} from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { EvaluationRunsSearch, RefreshInterval, ResolvedEvaluationRunsSearch } from "../types";
import { evaluationRunActiveFilterCount, refreshMilliseconds, timeRangeForPreset } from "../utils";
import { useDataDeletions } from "./use-data-deletions";
import { useObservabilityProject } from "./use-observability-project";

export function useEvaluationRuns() {
  const { project } = useObservabilityProject();
  const filters = useSearch({ strict: false }) as ResolvedEvaluationRunsSearch;
  const navigate = useNavigate();
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const [selectedRuns, setSelectedRuns] = useState<EvaluationRunSummary[]>([]);
  const deletions = useDataDeletions(project.id, "evaluation_run");
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<EvaluationRunsSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/evaluations/runs",
        params: { projectId: project.id },
        search: { ...filters, ...changes, page: resetPage ? 1 : (changes.page ?? filters.page) },
        replace: true,
      });
    },
    [filters, navigate, project.id],
  );
  useEffect(() => setSearchDraft(filters.search ?? ""), [filters.search]);
  useEffect(() => {
    if (searchDraft === (filters.search ?? "")) return;
    const timeout = window.setTimeout(
      () => setFilters({ search: searchDraft.trim() || undefined }),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [filters.search, searchDraft, setFilters]);

  const requestFilters = {
    ...range,
    suite: filters.suites,
    status: filters.statuses,
    environment: filters.environments,
    release: filters.releases,
    search: filters.search,
  };
  const runs = useQuery({
    queryKey: ["evaluation-runs", project.id, filters],
    queryFn: () =>
      api<Page<EvaluationRunSummary>>(
        `/api/v1/projects/${project.id}/evaluation-runs?${queryString({
          ...requestFilters,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort,
          order: filters.order,
        })}`,
      ),
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const facets = useQuery({
    queryKey: ["evaluation-run-facets", project.id, requestFilters],
    queryFn: () =>
      api<EvaluationRunFacets>(
        `/api/v1/projects/${project.id}/evaluation-runs/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const overview = useQuery({
    queryKey: [
      "evaluation-overview",
      project.id,
      filters.range,
      filters.suites,
      filters.environments,
      filters.releases,
    ],
    queryFn: () =>
      api<EvaluationOverview>(
        `/api/v1/projects/${project.id}/evaluations/overview?${queryString({
          range: filters.range,
          suite: filters.suites,
          environment: filters.environments,
          release: filters.releases,
        })}`,
      ),
    enabled: overviewOpen,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });

  const toggleRunSelection = (run: EvaluationRunSummary, selected: boolean) => {
    setSelectedRuns((current) => {
      if (!selected) return current.filter((item) => item.id !== run.id);
      if (current.some((item) => item.id === run.id) || current.length >= 100) return current;
      return [...current, run];
    });
  };
  const toggleVisibleRunSelection = (visible: EvaluationRunSummary[], selected: boolean) => {
    setSelectedRuns((current) => {
      if (!selected) {
        const ids = new Set(visible.map((run) => run.id));
        return current.filter((run) => !ids.has(run.id));
      }
      const next = new Map(current.map((run) => [run.id, run]));
      for (const run of visible) {
        if (next.size >= 100) break;
        next.set(run.id, run);
      }
      return [...next.values()];
    });
  };
  const compareSelectedRuns = () => {
    const roles = assignComparisonRuns(selectedRuns);
    if (roles === undefined) return;
    void navigate({
      to: "/$projectId/evaluations/compare",
      params: { projectId: project.id },
      search: { baselineRunId: roles.baseline.id, candidateRunId: roles.candidate.id },
    });
  };
  const clearFilters = () =>
    setFilters({
      statuses: [],
      suites: [],
      environments: [],
      releases: [],
      search: undefined,
    });

  return {
    activeFilterCount: evaluationRunActiveFilterCount(filters),
    clearFilters,
    compareSelectedRuns,
    deletions,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    overview,
    overviewOpen,
    project,
    refreshInterval,
    runs,
    searchDraft,
    selectedRuns,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setOverviewOpen,
    setRefreshInterval,
    setSearchDraft,
    toggleRunSelection,
    toggleVisibleRunSelection,
    clearRunSelection: () => setSelectedRuns([]),
  };
}

export function useEvaluationRunDetail(runId: string) {
  const { project } = useObservabilityProject();
  const search = useSearch({ from: "/$projectId/evaluations/runs/$runId" });
  const navigate = useNavigate();
  const deletions = useDataDeletions(project.id, "evaluation_run");
  const detail = useQuery({
    queryKey: ["evaluation-run", project.id, runId],
    queryFn: () =>
      api<EvaluationRunDetail>(
        `/api/v1/projects/${project.id}/evaluation-runs/${encodeURIComponent(runId)}`,
      ),
    refetchInterval: 5_000,
  });
  const selectCase = useCallback(
    (caseId: string | null) => {
      void navigate({
        to: "/$projectId/evaluations/runs/$runId",
        params: { projectId: project.id, runId },
        search: { case: caseId ?? undefined },
      });
    },
    [navigate, project.id, runId],
  );
  const deleteRun = () =>
    deletions.create.mutate([runId], {
      onSuccess: () =>
        void navigate({
          to: "/$projectId/evaluations/runs",
          params: { projectId: project.id },
          search: { range: "24h" },
        }),
    });
  return {
    deleteRun,
    deletionPending: deletions.create.isPending,
    detail,
    project,
    search,
    selectCase,
  };
}

export type EvaluationRunsState = ReturnType<typeof useEvaluationRuns>;
export type EvaluationRunDetailState = ReturnType<typeof useEvaluationRunDetail>;

export function assignComparisonRuns(
  runs: EvaluationRunSummary[],
): { baseline: EvaluationRunSummary; candidate: EvaluationRunSummary } | undefined {
  if (runs.length !== 2) return undefined;
  if (
    runs.some((run) => run.status !== "completed") ||
    runs[0]?.suiteName !== runs[1]?.suiteName ||
    runs[0]?.environment !== runs[1]?.environment
  )
    return undefined;
  const [baseline, candidate] = runs.toSorted(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  return baseline === undefined || candidate === undefined ? undefined : { baseline, candidate };
}
