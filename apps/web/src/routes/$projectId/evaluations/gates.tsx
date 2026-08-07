import { createFileRoute } from "@tanstack/react-router";
import { QualityGatesView } from "../../../modules/observability/components/quality-gates-view";
import { useQualityGates } from "../../../modules/observability/hooks/use-evaluation-workspace";

export const Route = createFileRoute("/$projectId/evaluations/gates")({
  component: QualityGatesPage,
});

function QualityGatesPage() {
  return <QualityGatesView state={useQualityGates()} />;
}
