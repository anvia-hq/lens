// @vitest-environment happy-dom

import { TooltipProvider } from "@lens/ui/components/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContext } from "../modules/projects/hooks/use-project";
import type { ProjectWithRole } from "../modules/projects/types";
import { ProjectRail } from "./project-rail";

type MockLinkProps = ComponentProps<"a"> & {
  params: { projectId: string };
  search: { range: string };
  to: string;
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, search, to: _to, ...props }: MockLinkProps) => (
    <a href={`/${params.projectId}?range=${search.range}`} {...props} />
  ),
}));

afterEach(cleanup);

const projects: ProjectWithRole[] = [
  {
    id: "project-alpha",
    teamId: "anvia-lens",
    name: "Alpha",
    slug: "alpha",
    state: "active",
    settings: { retentionDays: 30 },
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    role: "owner",
  },
  {
    id: "project-beta",
    teamId: "anvia-lens",
    name: "Beta",
    slug: "beta",
    state: "active",
    settings: { retentionDays: 30 },
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    role: "owner",
  },
];

describe("ProjectRail", () => {
  it("renders accessible project links and marks the active project", () => {
    render(
      <TooltipProvider>
        <ProjectContext.Provider value={{ project: projects[0] as ProjectWithRole, projects }}>
          <ProjectRail />
        </ProjectContext.Provider>
      </TooltipProvider>,
    );

    const alpha = screen.getByRole("link", { name: "Switch to Alpha" });
    const beta = screen.getByRole("link", { name: "Switch to Beta" });

    expect(alpha.getAttribute("href")).toBe("/project-alpha?range=24h");
    expect(beta.getAttribute("href")).toBe("/project-beta?range=24h");
    expect(alpha.getAttribute("aria-current")).toBe("page");
    expect(beta.hasAttribute("aria-current")).toBe(false);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("keeps long project lists in an independently scrollable navigation area", () => {
    const { container } = render(
      <TooltipProvider>
        <ProjectContext.Provider value={{ project: projects[0] as ProjectWithRole, projects }}>
          <ProjectRail />
        </ProjectContext.Provider>
      </TooltipProvider>,
    );

    expect(container.querySelector("nav")?.classList.contains("overflow-y-auto")).toBe(true);
  });

  it("shows the full project name in a tooltip", async () => {
    render(
      <TooltipProvider>
        <ProjectContext.Provider value={{ project: projects[0] as ProjectWithRole, projects }}>
          <ProjectRail />
        </ProjectContext.Provider>
      </TooltipProvider>,
    );

    fireEvent.mouseEnter(screen.getByRole("link", { name: "Switch to Beta" }));
    expect(await screen.findByText("Beta")).toBeTruthy();
  });
});
