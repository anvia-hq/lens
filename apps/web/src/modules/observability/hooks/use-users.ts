import type { Page as PaginatedPage, UserSummary } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { RefreshInterval, UsersSearch } from "../types";
import { refreshMilliseconds, timeRangeForUserRange } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useUsers() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as UsersSearch;
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("30s");
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const range = useMemo(() => timeRangeForUserRange(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<UsersSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/users",
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

  const users = useQuery({
    queryKey: ["users", project.id, filters],
    queryFn: () =>
      api<PaginatedPage<UserSummary>>(
        `/api/v1/projects/${project.id}/users?${queryString({
          ...range,
          search: filters.search,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort,
          order: filters.order,
        })}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMilliseconds(refreshInterval),
  });

  return {
    filters,
    project,
    refreshInterval,
    searchDraft,
    setFilters,
    setRefreshInterval,
    setSearchDraft,
    users,
  };
}

export type UsersState = ReturnType<typeof useUsers>;
