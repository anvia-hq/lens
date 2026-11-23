// @vitest-environment happy-dom

import type { TraceSummary } from "@lens/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContext } from "../../projects/hooks/use-project";
import type { ProjectWithRole } from "../../projects/types";
import { TraceDataTable } from "./trace-data-table";

type MockLinkProps = ComponentProps<"a"> & {
  params: { projectId: string; traceId: string };
  to: string;
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ params, to: _to, ...props }: MockLinkProps) => (
    <a href={`/${params.projectId}/traces/${params.traceId}`} {...props} />
  ),
}));

afterEach(cleanup);

describe("trace table selection", () => {
  it("selects individual rows and disables new selections at one hundred traces", () => {
    const onTraceSelectionChange = vi.fn();
    const { rerender } = renderTable(["trace-1"], onTraceSelectionChange);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select support-agent" }));
    expect(onTraceSelectionChange).toHaveBeenCalledWith("trace-5", true);

    rerender(
      table(
        Array.from({ length: 100 }, (_, index) => `selected-${index}`),
        onTraceSelectionChange,
      ),
    );
    const limitedCheckbox = screen.getByRole("checkbox", { name: "Select support-agent" });
    expect(limitedCheckbox.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(limitedCheckbox);
    expect(onTraceSelectionChange).toHaveBeenCalledOnce();
  });

  it("populates aria-sort on the active server-sorted column header", () => {
    render(
      <ProjectContext.Provider value={{ project, projects: [project] }}>
        <TraceDataTable traces={[trace()]} sort="name" order="asc" onSort={vi.fn()} />
      </ProjectContext.Provider>,
    );

    const traceHeader = screen.getByRole("button", { name: /Sort by Trace/i }).closest("th");
    const startedHeader = screen.getByRole("button", { name: /Sort by Started/i }).closest("th");
    expect(traceHeader?.getAttribute("aria-sort")).toBe("ascending");
    expect(startedHeader?.getAttribute("aria-sort")).toBeNull();
  });

  it("renders input/output previews and triggers onPeekTrace on row click without firing on checkbox", () => {
    const onPeekTrace = vi.fn();
    const onTraceSelectionChange = vi.fn();
    render(
      <ProjectContext.Provider value={{ project, projects: [project] }}>
        <TraceDataTable
          traces={[
            {
              ...trace(),
              inputPreview: "Investigate checkout failure",
              outputPreview: "Fixed autocomplete state sync",
            },
          ]}
          selectedTraceIds={[]}
          onTraceSelectionChange={onTraceSelectionChange}
          onPeekTrace={onPeekTrace}
        />
      </ProjectContext.Provider>,
    );

    expect(screen.getByText("Investigate checkout failure")).toBeTruthy();
    expect(screen.getByText("Fixed autocomplete state sync")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select support-agent" }));
    expect(onTraceSelectionChange).toHaveBeenCalledWith("trace-5", true);
    expect(onPeekTrace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Investigate checkout failure"));
    expect(onPeekTrace).toHaveBeenCalledWith("trace-5");
  });
});

const project: ProjectWithRole = {
  id: "project-1",
  teamId: "team-1",
  name: "Project",
  slug: "project",
  state: "active",
  settings: { retentionDays: 30 },
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  role: "owner",
};

function renderTable(
  selectedTraceIds: string[],
  onTraceSelectionChange: (traceId: string, selected: boolean) => void,
) {
  return render(table(selectedTraceIds, onTraceSelectionChange));
}

function table(
  selectedTraceIds: string[],
  onTraceSelectionChange: (traceId: string, selected: boolean) => void,
) {
  return (
    <ProjectContext.Provider value={{ project, projects: [project] }}>
      <TraceDataTable
        traces={[trace()]}
        selectedTraceIds={selectedTraceIds}
        onTraceSelectionChange={onTraceSelectionChange}
      />
    </ProjectContext.Provider>
  );
}

function trace(): TraceSummary {
  return {
    projectId: "project-1",
    traceId: "trace-5",
    name: "support-agent",
    serviceName: "support",
    status: "ok",
    startedAt: "2026-08-05T00:00:00.000Z",
    endedAt: "2026-08-05T00:00:00.100Z",
    durationMs: 100,
    spanCount: 1,
    generationCount: 0,
    toolCount: 0,
    errorCount: 0,
    userId: null,
    sessionId: null,
    tags: [],
    model: null,
    environment: "production",
    release: null,
    version: null,
    serviceVersion: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: null,
    outputCost: null,
    totalCost: null,
    lastSeenAt: "2026-08-05T00:00:00.100Z",
  };
}
