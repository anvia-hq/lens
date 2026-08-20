import type { Page as PaginatedPage, SessionFacets, SessionSummary } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { RefreshInterval, ResolvedSessionsSearch, SessionsSearch } from "../types";
import { refreshMilliseconds, sessionActiveFilterCount, timeRangeForPreset } from "../utils";
import { useDataDeletions } from "./use-data-deletions";
import { useObservabilityProject } from "./use-observability-project";

export function useSessions() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedSessionsSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("5s");
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const deletions = useDataDeletions(project.id, "session");
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<SessionsSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/sessions",
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
    status: filters.statuses,
    user: filters.users,
    service: filters.services,
    model: filters.models,
    environment: filters.environments,
    tag: filters.tags,
    search: filters.search,
    minDurationMs: filters.minDurationMs,
    maxDurationMs: filters.maxDurationMs,
    minTotalTokens: filters.minTotalTokens,
    maxTotalTokens: filters.maxTotalTokens,
    minTotalCost: filters.minTotalCost,
    maxTotalCost: filters.maxTotalCost,
  };
  const sessions = useQuery({
    queryKey: ["sessions", project.id, filters],
    queryFn: () =>
      api<PaginatedPage<SessionSummary>>(
        `/api/v1/projects/${project.id}/sessions?${queryString({
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
    queryKey: ["session-facets", project.id, requestFilters],
    queryFn: () =>
      api<SessionFacets>(
        `/api/v1/projects/${project.id}/sessions/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });
  const activeFilterCount = sessionActiveFilterCount(filters);
  const clearFilters = () =>
    setFilters({
      statuses: [],
      users: [],
      services: [],
      models: [],
      environments: [],
      tags: [],
      search: undefined,
      minDurationMs: undefined,
      maxDurationMs: undefined,
      minTotalTokens: undefined,
      maxTotalTokens: undefined,
      minTotalCost: undefined,
      maxTotalCost: undefined,
    });
  const toggleSessionSelection = (sessionId: string, selected: boolean) => {
    setSelectedSessionIds((current) => {
      if (!selected) return current.filter((item) => item !== sessionId);
      return current.includes(sessionId) || current.length >= 100
        ? current
        : [...current, sessionId];
    });
  };
  const toggleVisibleSessionSelection = (sessionIds: string[], selected: boolean) => {
    setSelectedSessionIds((current) => {
      if (!selected) return current.filter((item) => !sessionIds.includes(item));
      const next = new Set(current);
      for (const id of sessionIds) {
        if (next.size >= 100) break;
        next.add(id);
      }
      return [...next];
    });
  };

  return {
    activeFilterCount,
    clearFilters,
    clearSessionSelection: () => setSelectedSessionIds([]),
    deletions,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    project,
    refreshInterval,
    searchDraft,
    selectedSessionIds,
    sessions,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setRefreshInterval,
    setSearchDraft,
    toggleSessionSelection,
    toggleVisibleSessionSelection,
  };
}

export type SessionsState = ReturnType<typeof useSessions>;
