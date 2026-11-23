import type { Page as PaginatedPage, RunFacets, RunListItem } from "@lens/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { RefreshInterval, ResolvedRunsSearch, RunsSearch } from "../types";
import { refreshMilliseconds, runActiveFilterCount, timeRangeForPreset } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useRuns() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedRunsSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const [peekedRun, setPeekedRun] = useState<{ traceId: string; spanId: string } | null>(null);

  const setFilters = useCallback(
    (changes: Partial<RunsSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/runs",
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
    observationKind: filters.observationKinds,
    status: filters.statuses,
    service: filters.services,
    name: filters.names,
    model: filters.models,
    environment: filters.environments,
    release: filters.releases,
    version: filters.versions,
    serviceVersion: filters.serviceVersions,
    tag: filters.tags,
    userId: filters.userId,
    sessionId: filters.sessionId,
    traceId: filters.traceId,
    search: filters.search,
    minDurationMs: filters.minDurationMs,
    maxDurationMs: filters.maxDurationMs,
    minTotalTokens: filters.minTotalTokens,
    maxTotalTokens: filters.maxTotalTokens,
    minTotalCost: filters.minTotalCost,
    maxTotalCost: filters.maxTotalCost,
  };

  const runs = useQuery({
    queryKey: [
      "runs",
      project.id,
      filters.range,
      requestFilters,
      filters.page,
      filters.pageSize,
      filters.sort,
      filters.order,
    ],
    queryFn: ({ signal }) =>
      api<PaginatedPage<RunListItem>>(
        `/api/v1/projects/${project.id}/runs?${queryString({
          ...requestFilters,
          ...timeRangeForPreset(filters.range),
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort,
          order: filters.order,
        })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });

  const facets = useQuery({
    queryKey: ["run-facets", project.id, filters.range, requestFilters],
    queryFn: ({ signal }) =>
      api<RunFacets>(
        `/api/v1/projects/${project.id}/runs/facets?${queryString({
          ...requestFilters,
          ...timeRangeForPreset(filters.range),
        })}`,
        { signal },
      ),
    placeholderData: keepPreviousData,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });

  const activeFilterCount = runActiveFilterCount(filters);

  const clearFilters = () =>
    setFilters({
      observationKinds: [],
      statuses: [],
      services: [],
      names: [],
      models: [],
      environments: [],
      releases: [],
      versions: [],
      serviceVersions: [],
      tags: [],
      userId: undefined,
      sessionId: undefined,
      traceId: undefined,
      search: undefined,
      minDurationMs: undefined,
      maxDurationMs: undefined,
      minTotalTokens: undefined,
      maxTotalTokens: undefined,
      minTotalCost: undefined,
      maxTotalCost: undefined,
    });

  return {
    activeFilterCount,
    clearFilters,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    peekedRun,
    project,
    refreshInterval,
    runs,
    searchDraft,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setPeekedRun,
    setRefreshInterval,
    setSearchDraft,
  };
}

export type RunsState = ReturnType<typeof useRuns>;
