import { createFileRoute } from "@tanstack/react-router";
import { EvaluationsView } from "../../../modules/observability/components/evaluations-view";
import { useEvaluations } from "../../../modules/observability/hooks/use-evaluations";
import type { EvaluationResultsSearch } from "../../../modules/observability/types";
import { validateEvaluationResultsSearch as normalizeEvaluationResultsSearch } from "../../../modules/observability/utils";

export function validateEvaluationResultsSearch(
  search: Record<string, unknown>,
): EvaluationResultsSearch {
  return normalizeEvaluationResultsSearch(search);
}

export const Route = createFileRoute("/$projectId/evaluations/results")({
  validateSearch: validateEvaluationResultsSearch,
  component: EvaluationResultsPage,
});

function EvaluationResultsPage() {
  return <EvaluationsView state={useEvaluations()} />;
}
