// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectWithRole } from "../modules/projects/types";
import { AuthenticatedApp } from "./app-shell";

const mocks = vi.hoisted(() => ({ pathname: "/project-alpha" }));

vi.mock("@tanstack/react-router", () => ({
  Outlet: () => <div>Route content</div>,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: mocks.pathname } }),
}));

vi.mock("../modules/projects/hooks/use-projects", () => ({
  useProjects: () => ({
    project,
    projects: [project],
    projectsQuery: { isLoading: false, isError: false },
  }),
}));

vi.mock("./app-header", () => ({ AppHeader: () => <div>App header</div> }));
vi.mock("./app-sidebar", () => ({ AppSidebar: () => <div>App sidebar</div> }));
vi.mock("./project-rail", () => ({ ProjectRail: () => <div>Project rail</div> }));
vi.mock("./project-selector-shell", () => ({
  ProjectSelectorShell: () => <div>Workspace shell</div>,
}));

const project: ProjectWithRole = {
  id: "project-alpha",
  teamId: "anvia-lens",
  name: "Alpha",
  slug: "alpha",
  state: "active",
  settings: { retentionDays: 30 },
  createdAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-06T00:00:00.000Z",
  role: "owner",
};

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

describe("AuthenticatedApp shell", () => {
  it("shows the project rail before the project sidebar on project pages", () => {
    mocks.pathname = "/project-alpha";
    const { container } = render(
      <AuthenticatedApp user={{ name: "Alex", email: "alex@example.com" }} />,
    );

    expect(screen.getByText("Project rail")).toBeTruthy();
    expect(screen.getByText("App sidebar")).toBeTruthy();
    expect(container.textContent?.indexOf("Project rail")).toBeLessThan(
      container.textContent?.indexOf("App sidebar") ?? -1,
    );
  });

  it.each(["/", "/members", "/llm-models"])(
    "keeps the project rail off the %s workspace route",
    (pathname) => {
      mocks.pathname = pathname;
      render(<AuthenticatedApp user={{ name: "Alex", email: "alex@example.com" }} />);

      expect(screen.queryByText("Project rail")).toBeNull();
      expect(screen.getByText("Workspace shell")).toBeTruthy();
    },
  );
});
