import { createFileRoute } from "@tanstack/react-router";
import { EvaluationDatasetsView } from "../../../modules/observability/components/evaluation-datasets-view";
import { useEvaluationDatasets } from "../../../modules/observability/hooks/use-evaluation-datasets";
import { validateEvaluationDatasetsSearch } from "../../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/evaluations/datasets")({
  validateSearch: validateEvaluationDatasetsSearch,
  component: EvaluationDatasetsPage,
});

function EvaluationDatasetsPage() {
  return <EvaluationDatasetsView state={useEvaluationDatasets()} />;
}
