import { createFileRoute } from "@tanstack/react-router";
import { EvaluationRunDetailView } from "../../../../modules/observability/components/evaluation-run-detail-view";
import { useEvaluationRunDetail } from "../../../../modules/observability/hooks/use-evaluation-runs";

export const Route = createFileRoute("/$projectId/evaluations/runs/$runId")({
  component: EvaluationRunDetailPage,
});

function EvaluationRunDetailPage() {
  const { runId } = Route.useParams();
  return <EvaluationRunDetailView state={useEvaluationRunDetail(runId)} />;
}
