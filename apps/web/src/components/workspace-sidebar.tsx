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
  Activity,
  Database,
  LayersThree as Layers3,
  Logout as LogOut,
  Microchip as Robot,
  Users,
} from "@mynaui/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { signOutAndClearCache } from "../lib/auth";
import { useProject } from "../modules/projects/hooks/use-project";
import type { AuthenticatedUser } from "../types";
import { SidebarGithubPromo } from "./github-star-banner";

export function WorkspaceSidebar({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
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
            <SidebarMenu className="gap-0.5">
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
        <SidebarGithubPromo />
        <div className="flex items-center gap-2 p-1">
          <Avatar className="size-6">
            <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-base font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={() => void signOutAndClearCache(queryClient)}
          >
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
