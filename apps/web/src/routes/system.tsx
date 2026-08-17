import { createFileRoute } from "@tanstack/react-router";
import { SystemHealthView } from "../modules/system-health/components/system-health-view";
import { useSystemHealth } from "../modules/system-health/hooks/use-system-health";

export const Route = createFileRoute("/system")({ component: SystemHealthPage });

function SystemHealthPage() {
  return <SystemHealthView state={useSystemHealth()} />;
}
