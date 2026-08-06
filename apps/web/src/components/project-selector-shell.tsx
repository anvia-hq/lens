import { Button } from "@lens/ui/components/button";
import { Logout2 as LogOut } from "@solar-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import type { AuthenticatedUser } from "../types";

export function ProjectSelectorShell({ user }: { user: AuthenticatedUser }) {
  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <header className="flex h-14 items-center border-b px-4 md:px-6">
        <Link className="flex items-center gap-2" to="/">
          <span className="font-heading text-lg font-semibold">Anvia Lens</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={() => authClient.signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
