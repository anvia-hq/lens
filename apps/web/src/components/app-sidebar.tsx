import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Button } from "@lens/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@lens/ui/components/sidebar";
import {
  Pulse as Activity,
  ArrowsLeftRight,
  Bell,
  ChartBar,
  Database,
  Flask,
  Gauge,
  GithubLogo,
  House,
  SignOut as LogOut,
  Chats as MessagesSquare,
  Gear as Settings,
  TerminalWindow as TerminalSquare,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { useActiveAlertCount } from "../modules/observability/hooks/use-alerts";
import { useProject } from "../modules/projects/hooks/use-project";
import type { AuthenticatedUser } from "../types";

export function AppSidebar({ user }: { user: AuthenticatedUser }) {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projectRoot = `/${project.id}`;
  const activeAlerts = useActiveAlertCount(project.id).data?.count ?? 0;
  const observabilityLinks = [
    { to: "/$projectId" as const, path: projectRoot, label: "Overview", icon: House, badge: 0 },
    {
      to: "/$projectId/traces" as const,
      path: `${projectRoot}/traces`,
      label: "Traces",
      icon: Activity,
      badge: 0,
    },
    {
      to: "/$projectId/sessions" as const,
      path: `${projectRoot}/sessions`,
      label: "Sessions",
      icon: MessagesSquare,
      badge: 0,
    },
    {
      to: "/$projectId/users" as const,
      path: `${projectRoot}/users`,
      label: "Users",
      icon: Users,
      badge: 0,
    },
    {
      to: "/$projectId/alerts" as const,
      path: `${projectRoot}/alerts`,
      label: "Alerts",
      icon: Bell,
      badge: activeAlerts,
    },
  ];
  const evaluationLinks = [
    {
      to: "/$projectId/evaluations/runs" as const,
      path: `${projectRoot}/evaluations/runs`,
      label: "Runs",
      icon: Flask,
      badge: 0,
    },
    {
      to: "/$projectId/evaluations/results" as const,
      path: `${projectRoot}/evaluations/results`,
      label: "Results",
      icon: ChartBar,
      badge: 0,
    },
    {
      to: "/$projectId/evaluations/compare" as const,
      path: `${projectRoot}/evaluations/compare`,
      label: "Compare",
      icon: ArrowsLeftRight,
      badge: 0,
    },
    {
      to: "/$projectId/evaluations/gates" as const,
      path: `${projectRoot}/evaluations/gates`,
      label: "Gates",
      icon: Gauge,
      badge: 0,
    },
    {
      to: "/$projectId/evaluations/datasets" as const,
      path: `${projectRoot}/evaluations/datasets`,
      label: "Datasets",
      icon: Database,
      badge: 0,
    },
  ];
  const managementLinks = [
    {
      to: "/$projectId/connect" as const,
      path: `${projectRoot}/connect`,
      label: "Connect",
      icon: TerminalSquare,
      badge: 0,
    },
    {
      to: "/$projectId/settings" as const,
      path: `${projectRoot}/settings`,
      label: "Settings",
      icon: Settings,
      badge: 0,
    },
  ];
  const renderLinks = (
    links: typeof observabilityLinks | typeof evaluationLinks | typeof managementLinks,
  ) => (
    <SidebarMenu className="gap-1">
      {links.map(({ to, path, label, icon: Icon, badge }) => {
        const active = path === projectRoot ? pathname === path : pathname.startsWith(path);
        return (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton
              render={<Link to={to} params={{ projectId: project.id }} />}
              isActive={active}
              tooltip={label}
            >
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
            {badge > 0 ? <SidebarMenuBadge>{badge > 99 ? "99+" : badge}</SidebarMenuBadge> : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
  return (
    <Sidebar className="h-svh min-h-0 shrink-0 border-r border-sidebar-border" collapsible="none">
      <SidebarContent>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Observability</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(observabilityLinks)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Evaluations</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(evaluationLinks)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(managementLinks)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <a
          className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 transition-colors hover:bg-sidebar-accent"
          href="https://github.com/anvia-hq/lens"
          target="_blank"
          rel="noreferrer"
        >
          <GithubLogo className="size-5 shrink-0" />
          <span className="grid min-w-0">
            <span className="truncate text-xs font-medium">Enjoying Anvia Lens?</span>
            <span className="truncate text-xs text-muted-foreground">Star us on GitHub</span>
          </span>
        </a>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="size-8">
            <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 group-data-collapsible-icon:hidden">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <Button
            className="group-data-collapsible-icon:hidden"
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
