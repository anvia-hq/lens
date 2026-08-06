import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Button } from "@lens/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@lens/ui/components/sidebar";
import {
  Pulse as Activity,
  House,
  SignOut as LogOut,
  Chats as MessagesSquare,
  Gear as Settings,
  TerminalWindow as TerminalSquare,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { useProject } from "../modules/projects/hooks/use-project";
import type { AuthenticatedUser } from "../types";
import { ModeToggle } from "./mode-toggle";

export function AppSidebar({ user }: { user: AuthenticatedUser }) {
  const { project } = useProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projectRoot = `/${project.id}`;
  const observabilityLinks = [
    { to: "/$projectId" as const, path: projectRoot, label: "Overview", icon: House },
    {
      to: "/$projectId/traces" as const,
      path: `${projectRoot}/traces`,
      label: "Traces",
      icon: Activity,
    },
    {
      to: "/$projectId/sessions" as const,
      path: `${projectRoot}/sessions`,
      label: "Sessions",
      icon: MessagesSquare,
    },
    {
      to: "/$projectId/users" as const,
      path: `${projectRoot}/users`,
      label: "Users",
      icon: Users,
    },
  ];
  const managementLinks = [
    {
      to: "/$projectId/onboarding" as const,
      path: `${projectRoot}/onboarding`,
      label: "Connect",
      icon: TerminalSquare,
    },
    {
      to: "/$projectId/settings" as const,
      path: `${projectRoot}/settings`,
      label: "Project settings",
      icon: Settings,
    },
  ];
  const renderLinks = (links: typeof observabilityLinks | typeof managementLinks) => (
    <SidebarMenu className="gap-1">
      {links.map(({ to, path, label, icon: Icon }) => {
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
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
  return (
    <Sidebar className="h-svh min-h-0 shrink-0 border-r border-sidebar-border" collapsible="none">
      <SidebarHeader className="pb-0">
        <Link className="flex h-10 items-center gap-2 px-2" to="/">
          <div className="grid min-w-0 group-data-collapsible-icon:hidden">
            <span className="font-heading text-lg font-semibold">Anvia Lens</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Observability</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(observabilityLinks)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>{renderLinks(managementLinks)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ModeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
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
