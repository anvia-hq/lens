import { createFileRoute } from "@tanstack/react-router";
import { ManagedDatasetDetailView } from "../../../modules/observability/components/managed-datasets-view";
import { useManagedDatasetDetail } from "../../../modules/observability/hooks/use-evaluation-datasets";
import { validateManagedDatasetDetailSearch } from "../../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/evaluations/datasets_/managed/$datasetId")({
  validateSearch: validateManagedDatasetDetailSearch,
  component: ManagedDatasetDetailPage,
});

function ManagedDatasetDetailPage() {
  const { datasetId } = Route.useParams();
  return <ManagedDatasetDetailView state={useManagedDatasetDetail(datasetId)} />;
}
