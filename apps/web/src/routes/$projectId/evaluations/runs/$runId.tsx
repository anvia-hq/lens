import { createFileRoute } from "@tanstack/react-router";
import { EvaluationRunDetailView } from "../../../../modules/observability/components/evaluation-run-detail-view";
import { useEvaluationRunDetail } from "../../../../modules/observability/hooks/use-evaluation-runs";
import { validateEvaluationRunDetailSearch } from "../../../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/evaluations/runs/$runId")({
  validateSearch: validateEvaluationRunDetailSearch,
  component: EvaluationRunDetailPage,
});

function EvaluationRunDetailPage() {
  const { runId } = Route.useParams();
  return <EvaluationRunDetailView state={useEvaluationRunDetail(runId)} />;
}
