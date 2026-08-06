import { SidebarInset, SidebarProvider } from "@lens/ui/components/sidebar";
import { Pulse as Activity, DangerCircle as AlertCircle } from "@solar-icons/react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { ProjectSetup } from "../modules/projects/components/project-setup";
import { ProjectContext } from "../modules/projects/hooks/use-project";
import { useProjects } from "../modules/projects/hooks/use-projects";
import type { AuthenticatedUser } from "../types";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { FullPageMessage } from "./full-page-message";
import { ProjectSelectorShell } from "./project-selector-shell";

export function AuthenticatedApp({ user }: { user: AuthenticatedUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { project, projects, projectsQuery, selectProject } = useProjects();

  if (projectsQuery.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading projects" />;
  if (projectsQuery.isError)
    return (
      <FullPageMessage icon={<AlertCircle />} text="Could not load your Anvia Lens projects" />
    );
  if (project === undefined) {
    return projects.length === 0 ? (
      <ProjectSetup />
    ) : (
      <FullPageMessage icon={<AlertCircle />} text="Project not found or access was removed" />
    );
  }

  return (
    <ProjectContext.Provider value={{ project, projects, selectProject }}>
      {pathname === "/" ? (
        <ProjectSelectorShell user={user} />
      ) : (
        <SidebarProvider className="h-svh min-h-0 overflow-hidden">
          <AppSidebar user={user} />
          <SidebarInset className="h-svh min-h-0 overflow-y-auto">
            <AppHeader />
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      )}
    </ProjectContext.Provider>
  );
}
