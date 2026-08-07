import { createFileRoute } from "@tanstack/react-router";
import { EvaluationRunsView } from "../../../../modules/observability/components/evaluation-runs-view";
import { useEvaluationRuns } from "../../../../modules/observability/hooks/use-evaluation-runs";
import type { EvaluationRunsSearch } from "../../../../modules/observability/types";
import { validateEvaluationRunsSearch as normalizeEvaluationRunsSearch } from "../../../../modules/observability/utils";

export function validateEvaluationRunsSearch(
  search: Record<string, unknown>,
): EvaluationRunsSearch {
  return normalizeEvaluationRunsSearch(search);
}

export const Route = createFileRoute("/$projectId/evaluations/runs/")({
  validateSearch: validateEvaluationRunsSearch,
  component: EvaluationRunsPage,
});

function EvaluationRunsPage() {
  return <EvaluationRunsView state={useEvaluationRuns()} />;
}
