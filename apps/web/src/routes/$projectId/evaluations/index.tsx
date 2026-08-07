import { createFileRoute, redirect } from "@tanstack/react-router";
import type { LegacyEvaluationsSearch } from "../../../modules/observability/types";
import { validateEvaluationsSearch as normalizeEvaluationsSearch } from "../../../modules/observability/utils";

export function validateEvaluationsSearch(
  search: Record<string, unknown>,
): LegacyEvaluationsSearch {
  return normalizeEvaluationsSearch(search);
}

export const Route = createFileRoute("/$projectId/evaluations/")({
  validateSearch: validateEvaluationsSearch,
  beforeLoad: ({ params, search }) => {
    if (search.runId) {
      throw redirect({
        to: "/$projectId/evaluations/runs/$runId",
        params: { projectId: params.projectId, runId: search.runId },
        replace: true,
      });
    }
    if (search.view === "results") {
      throw redirect({
        to: "/$projectId/evaluations/results",
        params: { projectId: params.projectId },
        search: {
          range: search.range,
          suites: search.suite ? [search.suite] : [],
          metrics: search.metric ? [search.metric] : [],
          outcomes: search.outcome ? [search.outcome] : [],
          environments: search.environment ? [search.environment] : [],
          releases: search.release ? [search.release] : [],
          search: search.search,
          sort: search.sort,
          order: search.order,
          page: search.page,
          pageSize: search.pageSize,
        },
        replace: true,
      });
    }
    if (search.view === "compare") {
      throw redirect({
        to: "/$projectId/evaluations/compare",
        params: { projectId: params.projectId },
        search: {
          candidateRunId: search.candidateRunId,
          baselineRunId: search.baselineRunId,
          gateId: search.gateId,
        },
        replace: true,
      });
    }
    if (search.view === "gates") {
      throw redirect({
        to: "/$projectId/evaluations/gates",
        params: { projectId: params.projectId },
        replace: true,
      });
    }
    throw redirect({
      to: "/$projectId/evaluations/runs",
      params: { projectId: params.projectId },
      search: {
        range: search.range,
        statuses: search.status ? [search.status] : [],
        suites: search.suite ? [search.suite] : [],
        environments: search.environment ? [search.environment] : [],
        releases: search.release ? [search.release] : [],
        search: search.search,
        page: search.page,
        pageSize: search.pageSize,
      },
      replace: true,
    });
  },
});
