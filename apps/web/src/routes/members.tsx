import { createFileRoute } from "@tanstack/react-router";
import { ProjectsView } from "../modules/projects/components/projects-view";
import { useProjectManagement } from "../modules/projects/hooks/use-project-management";

export const Route = createFileRoute("/members")({ component: MembersPage });

function MembersPage() {
  const state = useProjectManagement();
  return <ProjectsView section="members" state={state} />;
}
