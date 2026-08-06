import { ProjectsView } from "../modules/projects/components/projects-view";
import { useProjectManagement } from "../modules/projects/hooks/use-project-management";

export function ProjectsPage() {
  const state = useProjectManagement();
  return <ProjectsView state={state} />;
}
