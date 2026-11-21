// @vitest-environment happy-dom

import { SidebarProvider } from "@lens/ui/components/sidebar";
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

vi.mock("./mode-toggle", () => ({ ModeToggle: () => <button type="button">Theme toggle</button> }));

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
    <SidebarProvider>
      <ProjectContext.Provider value={{ project, projects: [project] }}>
        <AppHeader />
      </ProjectContext.Provider>
    </SidebarProvider>,
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

  it("links dataset detail breadcrumbs back to Datasets and shows the dataset identifier", () => {
    const managed = renderHeader("/project-alpha/evaluations/datasets/managed/dataset-123456789", {
      datasetId: "dataset-123456789",
    });

    expect(screen.getByText("Datasets").closest("a")?.dataset.route).toBe(
      "/$projectId/evaluations/datasets",
    );
    expect(screen.getByText("datase…6789")).toBeTruthy();
    managed.unmount();

    renderHeader("/project-alpha/evaluations/datasets/observed/support-eval", {
      datasetName: "support-eval",
    });

    expect(screen.getByText("Datasets").closest("a")?.dataset.route).toBe(
      "/$projectId/evaluations/datasets",
    );
    expect(screen.getByText("support-eval")).toBeTruthy();
  });
});

describe("AppHeader prompt management breadcrumbs", () => {
  it("identifies prompts as a top-level product capability", () => {
    renderHeader("/project-alpha/prompts");

    expect(screen.getByText("Prompt Management")).toBeTruthy();
    expect(screen.queryByText("Evaluations")).toBeNull();
  });
});
