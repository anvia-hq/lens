import { createFileRoute } from "@tanstack/react-router";
import { AlertsView } from "../../modules/observability/components/alerts-view";
import { useAlerts } from "../../modules/observability/hooks/use-alerts";
import { validateAlertsSearch } from "../../modules/observability/utils";
import { restoreSavedFilters } from "../../modules/observability/utils/saved-filters";

export const Route = createFileRoute("/$projectId/alerts")({
  validateSearch: validateAlertsSearch,
  beforeLoad: restoreSavedFilters("alerts", "/$projectId/alerts"),
  component: AlertsPage,
});

function AlertsPage() {
  return <AlertsView state={useAlerts()} />;
}
