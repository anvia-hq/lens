import { createFileRoute } from "@tanstack/react-router";
import { AlertsView } from "../../modules/observability/components/alerts-view";
import { useAlerts } from "../../modules/observability/hooks/use-alerts";
import { validateAlertsSearch } from "../../modules/observability/utils";

export const Route = createFileRoute("/$projectId/alerts")({
  validateSearch: validateAlertsSearch,
  component: AlertsPage,
});

function AlertsPage() {
  return <AlertsView state={useAlerts()} />;
}
