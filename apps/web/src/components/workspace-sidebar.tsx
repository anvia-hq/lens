import { Avatar, AvatarFallback } from "@lens/ui/components/avatar";
import { Button } from "@lens/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@lens/ui/components/sidebar";
import {
  Pulse as Activity,
  Database,
  Stack as Layers3,
  SignOut as LogOut,
  Robot,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { useProject } from "../modules/projects/hooks/use-project";
import type { AuthenticatedUser } from "../types";

export function WorkspaceSidebar({ user }: { user: AuthenticatedUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { project } = useProject();
  const canManage = project.role === "owner" || project.role === "admin";
  const links = [
    { to: "/" as const, label: "Projects", icon: Layers3 },
    { to: "/members" as const, label: "Members", icon: Users },
    { to: "/cost-settings" as const, label: "Cost Settings", icon: Database },
    ...(canManage ? [{ to: "/mcp" as const, label: "MCP Access", icon: Robot }] : []),
    ...(canManage ? [{ to: "/system" as const, label: "System Health", icon: Activity }] : []),
  ];

  return (
    <Sidebar className="h-svh min-h-0 shrink-0 border-r border-sidebar-border" collapsible="none">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {links.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    render={<Link to={to} />}
                    isActive={pathname === to}
                    tooltip={label}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="size-8">
            <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <Button
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
