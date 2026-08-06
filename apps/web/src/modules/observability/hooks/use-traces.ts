import type { Page as PaginatedPage, TraceFacets, TraceSummary } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { RefreshInterval, ResolvedTracesSearch, TracesSearch } from "../types";
import { refreshMilliseconds, timeRangeForPreset, traceActiveFilterCount } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useTraces() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedTracesSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const [selectedTraceIds, setSelectedTraceIds] = useState<string[]>([]);
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<TracesSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/traces",
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
  }, [searchDraft, filters.search, setFilters]);
  const requestFilters = {
    ...range,
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
  const traces = useQuery({
    queryKey: ["traces", project.id, filters],
    queryFn: () =>
      api<PaginatedPage<TraceSummary>>(
        `/api/v1/projects/${project.id}/traces?${queryString({
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
    queryKey: ["trace-facets", project.id, requestFilters],
    queryFn: () =>
      api<TraceFacets>(
        `/api/v1/projects/${project.id}/traces/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const activeFilterCount = traceActiveFilterCount(filters);
  const clearFilters = () =>
    setFilters({
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
  const toggleTraceSelection = (traceId: string, selected: boolean) => {
    setSelectedTraceIds((current) => {
      if (!selected) return current.filter((item) => item !== traceId);
      if (current.includes(traceId) || current.length >= 4) return current;
      return [...current, traceId];
    });
  };
  const compareSelectedTraces = () => {
    if (selectedTraceIds.length < 2) return;
    void navigate({
      to: "/$projectId/traces/compare",
      params: { projectId: project.id },
      search: { traceIds: selectedTraceIds },
    });
  };

  return {
    activeFilterCount,
    clearFilters,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    refreshInterval,
    searchDraft,
    selectedTraceIds,
    clearTraceSelection: () => setSelectedTraceIds([]),
    compareSelectedTraces,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setRefreshInterval,
    setSearchDraft,
    toggleTraceSelection,
    traces,
  };
}

export type TracesState = ReturnType<typeof useTraces>;
