import { ProjectSettings } from "../modules/projects/components/project-settings";
import { useProjectSettings } from "../modules/projects/hooks/use-project-settings";

export function SettingsPage() {
  const state = useProjectSettings();
  return <ProjectSettings state={state} />;
}
