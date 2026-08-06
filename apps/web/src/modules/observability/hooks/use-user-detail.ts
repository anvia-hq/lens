import type {
  Page as PaginatedPage,
  SessionSortField,
  SessionSummary,
  TraceSortField,
  TraceSummary,
  UserSummary,
} from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { api, queryString } from "../../../lib/api";
import type { UserDetailSearch } from "../types";
import { timeRangeForUserRange } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useUserDetail() {
  const { project } = useObservabilityProject();
  const { userId } = useParams({ from: "/$projectId/users/$userId" });
  const filters = useSearch({ from: "/$projectId/users/$userId" });
  const navigate = useNavigate();
  const range = timeRangeForUserRange(filters.range);
  const encodedUserId = encodeURIComponent(userId);
  const setFilters = (changes: Partial<UserDetailSearch>, resetPage = true) =>
    void navigate({
      to: "/$projectId/users/$userId",
      params: { projectId: project.id, userId },
      search: { ...filters, ...changes, page: resetPage ? 1 : (changes.page ?? filters.page) },
      replace: true,
    });

  const user = useQuery({
    queryKey: ["user", project.id, userId, filters.range],
    queryFn: () =>
      api<UserSummary>(
        `/api/v1/projects/${project.id}/users/${encodedUserId}?${queryString(range)}`,
      ),
    refetchInterval: 30_000,
  });
  const traces = useQuery({
    queryKey: ["user-traces", project.id, userId, filters],
    queryFn: () =>
      api<PaginatedPage<TraceSummary>>(
        `/api/v1/projects/${project.id}/traces?${queryString({
          ...range,
          exactUserId: userId,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort as TraceSortField,
          order: filters.order,
        })}`,
      ),
    enabled: filters.tab === "traces",
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
  const sessions = useQuery({
    queryKey: ["user-sessions", project.id, userId, filters],
    queryFn: () =>
      api<PaginatedPage<SessionSummary>>(
        `/api/v1/projects/${project.id}/sessions?${queryString({
          ...range,
          user: userId,
          page: filters.page,
          pageSize: filters.pageSize,
          sort: filters.sort as SessionSortField,
          order: filters.order,
        })}`,
      ),
    enabled: filters.tab === "sessions",
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  return { filters, project, sessions, setFilters, traces, user, userId };
}

export type UserDetailState = ReturnType<typeof useUserDetail>;
