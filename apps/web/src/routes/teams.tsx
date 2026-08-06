import { createFileRoute } from "@tanstack/react-router";
import { ProjectsView } from "../modules/projects/components/projects-view";
import { useProjectManagement } from "../modules/projects/hooks/use-project-management";

export const Route = createFileRoute("/teams")({ component: TeamsPage });

function TeamsPage() {
  const state = useProjectManagement();
  return <ProjectsView section="teams" state={state} />;
}
