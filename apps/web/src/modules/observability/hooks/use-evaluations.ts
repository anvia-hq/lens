import type { EvaluationFacets, EvaluationResult, Page } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type {
  EvaluationResultsSearch,
  RefreshInterval,
  ResolvedEvaluationResultsSearch,
} from "../types";
import {
  evaluationResultActiveFilterCount,
  refreshMilliseconds,
  timeRangeForPreset,
} from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useEvaluations() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedEvaluationResultsSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<EvaluationResultsSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/evaluations/results",
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
    metric: filters.metrics,
    outcome: filters.outcomes,
    environment: filters.environments,
    release: filters.releases,
    search: filters.search,
  };
  const evaluations = useQuery({
    queryKey: ["evaluations", project.id, filters],
    queryFn: () =>
      api<Page<EvaluationResult>>(
        `/api/v1/projects/${project.id}/evaluations?${queryString({
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
    queryKey: ["evaluation-facets", project.id, requestFilters],
    queryFn: () =>
      api<EvaluationFacets>(
        `/api/v1/projects/${project.id}/evaluations/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const clearFilters = () =>
    setFilters({
      suites: [],
      metrics: [],
      outcomes: [],
      environments: [],
      releases: [],
      search: undefined,
    });

  return {
    activeFilterCount: evaluationResultActiveFilterCount(filters),
    clearFilters,
    evaluations,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    project,
    refreshInterval,
    searchDraft,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setRefreshInterval,
    setSearchDraft,
  };
}

export type EvaluationsState = ReturnType<typeof useEvaluations>;
