import { createFileRoute } from "@tanstack/react-router";
import { ProjectsView } from "../modules/projects/components/projects-view";
import { useProjectManagement } from "../modules/projects/hooks/use-project-management";

export const Route = createFileRoute("/")({ component: ProjectsPage });

function ProjectsPage() {
  const state = useProjectManagement();
  return <ProjectsView state={state} />;
}
