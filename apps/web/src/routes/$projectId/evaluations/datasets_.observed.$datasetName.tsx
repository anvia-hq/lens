import { createFileRoute } from "@tanstack/react-router";
import { ObservedDatasetDetailView } from "../../../modules/observability/components/evaluation-datasets-view";
import { useObservedDatasetDetail } from "../../../modules/observability/hooks/use-evaluation-datasets";
import { validateObservedDatasetDetailSearch } from "../../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/evaluations/datasets_/observed/$datasetName")({
  validateSearch: validateObservedDatasetDetailSearch,
  component: ObservedDatasetDetailPage,
});

function ObservedDatasetDetailPage() {
  const { datasetName } = Route.useParams();
  return <ObservedDatasetDetailView state={useObservedDatasetDetail(datasetName)} />;
}
