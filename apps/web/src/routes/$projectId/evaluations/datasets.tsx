import { createFileRoute } from "@tanstack/react-router";
import { EvaluationDatasetsView } from "../../../modules/observability/components/evaluation-datasets-view";
import { useEvaluationDatasets } from "../../../modules/observability/hooks/use-evaluation-datasets";
import { validateEvaluationDatasetsSearch } from "../../../modules/observability/utils";
import { restoreSavedFilters } from "../../../modules/observability/utils/saved-filters";

export const Route = createFileRoute("/$projectId/evaluations/datasets")({
  validateSearch: validateEvaluationDatasetsSearch,
  beforeLoad: restoreSavedFilters("evaluation-datasets", "/$projectId/evaluations/datasets"),
  component: EvaluationDatasetsPage,
});

function EvaluationDatasetsPage() {
  return <EvaluationDatasetsView state={useEvaluationDatasets()} />;
}
