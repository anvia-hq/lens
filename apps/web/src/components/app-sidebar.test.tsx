// @vitest-environment happy-dom

import { SidebarProvider } from "@lens/ui/components/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";
import { GITHUB_PROMO_DISMISSED_KEY } from "./github-star-banner";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => (
    <a data-route={to} href={to}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/project-alpha/prompts" } }),
}));

vi.mock("../lib/auth", () => ({
  authClient: { signOut: vi.fn() },
  signOutAndClearCache: vi.fn(),
}));
vi.mock("../modules/observability/hooks/use-alerts", () => ({
  useActiveAlertCount: () => ({ data: { count: 0 } }),
}));
vi.mock("../modules/projects/hooks/use-project", () => ({
  useProject: () => ({ project: { id: "project-alpha" } }),
}));

beforeEach(() => {
  window.localStorage.removeItem(GITHUB_PROMO_DISMISSED_KEY);
});

afterEach(cleanup);

describe("AppSidebar prompt management navigation", () => {
  it("places prompts in its own section outside evaluations", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SidebarProvider>
          <AppSidebar user={{ name: "Ada", email: "ada@example.com" }} />
        </SidebarProvider>
      </QueryClientProvider>,
    );

    const observabilityGroup = screen
      .getByText("Observability")
      .closest('[data-slot="sidebar-group"]');
    const promptGroup = screen
      .getByText("Prompt Management")
      .closest('[data-slot="sidebar-group"]');
    const evaluationGroup = screen.getByText("Evaluations").closest('[data-slot="sidebar-group"]');

    expect(observabilityGroup).not.toBeNull();
    expect(promptGroup).not.toBeNull();
    expect(evaluationGroup).not.toBeNull();
    expect(within(observabilityGroup as HTMLElement).getByText("Traces")).toBeTruthy();
    expect(within(observabilityGroup as HTMLElement).getByText("Runs")).toBeTruthy();
    expect(within(observabilityGroup as HTMLElement).getByText("Threads")).toBeTruthy();
    expect(screen.getByText("Runs").closest("a")?.dataset.route).toBe("/$projectId/runs");
    expect(screen.getByText("Threads").closest("a")?.dataset.route).toBe("/$projectId/threads");
    expect(within(evaluationGroup as HTMLElement).getByText("Experiments")).toBeTruthy();
    expect(within(evaluationGroup as HTMLElement).queryByText("Runs")).toBeNull();
    expect(within(promptGroup as HTMLElement).getByText("Prompts")).toBeTruthy();
    expect(within(evaluationGroup as HTMLElement).queryByText("Prompts")).toBeNull();
    expect(screen.getByText("Prompts").closest("a")?.dataset.route).toBe("/$projectId/prompts");
  });

  it("lets the user dismiss the GitHub star promo and remembers the dismissal", () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <SidebarProvider>
          <AppSidebar user={{ name: "Ada", email: "ada@example.com" }} />
        </SidebarProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Enjoying Anvia Lens?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss GitHub star prompt" }));
    expect(screen.queryByText("Enjoying Anvia Lens?")).toBeNull();
    expect(window.localStorage.getItem(GITHUB_PROMO_DISMISSED_KEY)).toBe("1");

    unmount();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SidebarProvider>
          <AppSidebar user={{ name: "Ada", email: "ada@example.com" }} />
        </SidebarProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Enjoying Anvia Lens?")).toBeNull();
  });
});
