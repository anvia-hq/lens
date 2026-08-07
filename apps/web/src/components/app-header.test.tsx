// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContext } from "../modules/projects/hooks/use-project";
import type { ProjectWithRole } from "../modules/projects/types";
import { AppHeader } from "./app-header";

const mocks = vi.hoisted(() => ({
  pathname: "/project-alpha/evaluations/runs",
  params: {} as Record<string, string>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => (
    <a data-route={to} href={to}>
      {children}
    </a>
  ),
  useParams: () => mocks.params,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: mocks.pathname } }),
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

function renderHeader(pathname: string, params: Record<string, string> = {}) {
  mocks.pathname = pathname;
  mocks.params = params;
  return render(
    <ProjectContext.Provider value={{ project, projects: [project] }}>
      <AppHeader />
    </ProjectContext.Provider>,
  );
}

describe("AppHeader evaluation breadcrumbs", () => {
  it.each([
    ["runs", "Runs"],
    ["datasets", "Datasets"],
    ["results", "Results"],
    ["compare", "Compare"],
    ["gates", "Quality gates"],
  ])("identifies the %s evaluation page", (route, label) => {
    renderHeader(`/project-alpha/evaluations/${route}`);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("Evaluations")).toBeNull();
  });

  it("shows the evaluation hierarchy for a run detail", () => {
    renderHeader("/project-alpha/evaluations/runs/run-123456789", {
      runId: "run-123456789",
    });

    expect(screen.getByText("Runs").closest("a")?.dataset.route).toBe(
      "/$projectId/evaluations/runs",
    );
    expect(screen.getByText("run-12…6789")).toBeTruthy();
  });
});
