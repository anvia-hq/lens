import type { EvaluationFacets, EvaluationOverview, EvaluationResult, Page } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, queryString } from "../../../lib/api";
import type { EvaluationsSearch, ResolvedEvaluationsSearch } from "../types";
import { timeRangeForPreset } from "../utils";
import { useObservabilityProject } from "./use-observability-project";

export function useEvaluations() {
  const { project } = useObservabilityProject();
  const navigate = useNavigate();
  const filters = useSearch({ strict: false }) as ResolvedEvaluationsSearch;
  const [searchDraft, setSearchDraft] = useState(filters.search ?? "");
  const range = useMemo(() => timeRangeForPreset(filters.range), [filters.range]);
  const setFilters = useCallback(
    (changes: Partial<EvaluationsSearch>, resetPage = true) => {
      void navigate({
        to: "/$projectId/evaluations",
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
    suite: filters.suite,
    metric: filters.metric,
    outcome: filters.outcome,
    environment: filters.environment,
    release: filters.release,
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
    enabled: filters.view === "results",
  });
  const overview = useQuery({
    queryKey: ["evaluation-overview", project.id, filters.range],
    queryFn: () =>
      api<EvaluationOverview>(
        `/api/v1/projects/${project.id}/evaluations/overview?${queryString({
          range: filters.range,
        })}`,
      ),
    enabled: filters.view === "results",
  });
  const facets = useQuery({
    queryKey: ["evaluation-facets", project.id, requestFilters],
    queryFn: () =>
      api<EvaluationFacets>(
        `/api/v1/projects/${project.id}/evaluations/facets?${queryString(requestFilters)}`,
      ),
    placeholderData: (previous) => previous,
    enabled: filters.view === "results",
  });

  return {
    evaluations,
    facets,
    filters,
    overview,
    project,
    searchDraft,
    setFilters,
    setSearchDraft,
  };
}

export type EvaluationsState = ReturnType<typeof useEvaluations>;
