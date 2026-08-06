import { createFileRoute } from "@tanstack/react-router";
import { ProjectSettings } from "../../modules/projects/components/project-settings";
import { useProjectSettings } from "../../modules/projects/hooks/use-project-settings";

export const Route = createFileRoute("/$projectId/settings")({ component: SettingsPage });

function SettingsPage() {
  const state = useProjectSettings();
  return <ProjectSettings state={state} />;
}
