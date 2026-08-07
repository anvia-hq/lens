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
  it("selects individual rows and disables new selections at four traces", () => {
    const onTraceSelectionChange = vi.fn();
    const { rerender } = renderTable(["trace-1"], onTraceSelectionChange);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select support-agent" }));
    expect(onTraceSelectionChange).toHaveBeenCalledWith("trace-5", true);

    rerender(table(["trace-1", "trace-2", "trace-3", "trace-4"], onTraceSelectionChange));
    const limitedCheckbox = screen.getByRole("checkbox", { name: "Select support-agent" });
    expect(limitedCheckbox.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(limitedCheckbox);
    expect(onTraceSelectionChange).toHaveBeenCalledOnce();
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
