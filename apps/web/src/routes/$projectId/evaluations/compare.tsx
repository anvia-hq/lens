import { createFileRoute } from "@tanstack/react-router";
import { EvaluationCompareView } from "../../../modules/observability/components/evaluation-compare-view";
import { useEvaluationCompare } from "../../../modules/observability/hooks/use-evaluation-workspace";
import type { EvaluationCompareSearch } from "../../../modules/observability/types";
import { validateEvaluationCompareSearch as normalizeEvaluationCompareSearch } from "../../../modules/observability/utils";

export function validateEvaluationCompareSearch(
  search: Record<string, unknown>,
): EvaluationCompareSearch {
  return normalizeEvaluationCompareSearch(search);
}

export const Route = createFileRoute("/$projectId/evaluations/compare")({
  validateSearch: validateEvaluationCompareSearch,
  component: EvaluationComparePage,
});

function EvaluationComparePage() {
  return <EvaluationCompareView state={useEvaluationCompare()} />;
}
