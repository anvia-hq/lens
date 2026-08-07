import { createFileRoute } from "@tanstack/react-router";
import {
  EvaluationNavigation,
  EvaluationWorkspaceView,
} from "../../modules/observability/components/evaluation-workspace-view";
import { EvaluationsView } from "../../modules/observability/components/evaluations-view";
import { useEvaluationWorkspace } from "../../modules/observability/hooks/use-evaluation-workspace";
import { useEvaluations } from "../../modules/observability/hooks/use-evaluations";
import type { EvaluationsSearch } from "../../modules/observability/types";
import { validateEvaluationsSearch as normalizeEvaluationsSearch } from "../../modules/observability/utils";

export function validateEvaluationsSearch(search: Record<string, unknown>): EvaluationsSearch {
  return normalizeEvaluationsSearch(search);
}

export const Route = createFileRoute("/$projectId/evaluations")({
  validateSearch: validateEvaluationsSearch,
  component: EvaluationsPage,
});

function EvaluationsPage() {
  const results = useEvaluations();
  const workspace = useEvaluationWorkspace();
  if (workspace.filters.view === "results") {
    return (
      <EvaluationsView
        state={results}
        navigation={
          <EvaluationNavigation
            view="results"
            onChange={(view) => workspace.setFilters({ view, runId: undefined })}
          />
        }
      />
    );
  }
  return <EvaluationWorkspaceView state={workspace} />;
}
