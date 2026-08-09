import { Bell } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageMessage } from "../../../components/full-page-message";
import { AlertIncidentView } from "../../../modules/observability/components/alert-incident-view";
import { useAlertIncident } from "../../../modules/observability/hooks/use-alerts";

export const Route = createFileRoute("/$projectId/alerts/$incidentId")({
  component: AlertIncidentPage,
});

function AlertIncidentPage() {
  const { incidentId } = Route.useParams();
  const state = useAlertIncident(incidentId);
  if (state.detail.isLoading) {
    return <FullPageMessage icon={<Bell />} text="Loading incident" contained />;
  }
  return <AlertIncidentView state={state} />;
}
