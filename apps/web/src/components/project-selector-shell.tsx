import { SidebarInset, SidebarProvider } from "@lens/ui/components/sidebar";
import { Outlet, useRouterState } from "@tanstack/react-router";
import type { AuthenticatedUser } from "../types";
import { ModeToggle } from "./mode-toggle";
import { ProjectRail } from "./project-rail";
import { WorkspaceSidebar } from "./workspace-sidebar";

export function ProjectSelectorShell({ user }: { user: AuthenticatedUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const title =
    pathname === "/members"
      ? "Members"
      : pathname === "/cost-settings"
        ? "Cost Settings"
        : pathname === "/system"
          ? "System Health"
          : "Projects";
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <ProjectRail logoOnly />
      <WorkspaceSidebar user={user} />
      <SidebarInset className="h-svh min-h-0 overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
          <span className="font-medium">{title}</span>
          <ModeToggle standalone />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
