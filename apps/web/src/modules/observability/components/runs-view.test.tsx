// @vitest-environment happy-dom

import type { RunListItem } from "@lens/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContext } from "../../projects/hooks/use-project";
import type { ProjectWithRole } from "../../projects/types";
import { defaultRunColumns, type ResolvedRunsSearch } from "../types";
import { RunExplorerTable } from "./run-explorer-table";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

afterEach(cleanup);

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

const baseFilters: ResolvedRunsSearch = {
  range: "24h",
  observationKinds: [],
  statuses: [],
  services: [],
  names: [],
  models: [],
  environments: [],
  releases: [],
  versions: [],
  serviceVersions: [],
  tags: [],
  sort: "startedAt",
  order: "desc",
  page: 1,
  pageSize: 50,
  columns: defaultRunColumns,
};

const sampleRun: RunListItem = {
  projectId: "project-1",
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
  parentSpanId: "c".repeat(16),
  name: "get_ticket",
  traceName: "ticket-triage",
  observationKind: "tool",
  status: "ok",
  statusMessage: "",
  startedAt: "2026-08-05T00:00:00.000Z",
  endedAt: "2026-08-05T00:00:00.200Z",
  durationMs: 200,
  serviceName: "support",
  model: null,
  environment: "production",
  release: null,
  version: null,
  serviceVersion: null,
  userId: "user-1",
  sessionId: "thread-1",
  tags: [],
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputCost: null,
  outputCost: null,
  totalCost: null,
  inputPreview: '{"id":"TICKET-1001"}',
  outputPreview: '{"severity":"high"}',
};

describe("RunExplorerTable", () => {
  it("applies quick type presets and invokes onSelectRun when clicking a row", () => {
    const onChange = vi.fn();
    const onSelectRun = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectContext.Provider value={{ project, projects: [project] }}>
          <RunExplorerTable
            filters={baseFilters}
            searchDraft=""
            onSearchChange={vi.fn()}
            data={{ items: [sampleRun], total: 1, page: 1, pageSize: 50, pageCount: 1 }}
            loading={false}
            error={null}
            activeFilterCount={0}
            onOpenMobileFilters={vi.fn()}
            onChange={onChange}
            onSelectRun={onSelectRun}
          />
        </ProjectContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("get_ticket")).toBeTruthy();
    expect(screen.getByText('{"id":"TICKET-1001"}')).toBeTruthy();
    expect(screen.getByText('{"severity":"high"}')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tool Calls" }));
    expect(onChange).toHaveBeenCalledWith({ observationKinds: ["tool"], statuses: [] });

    fireEvent.click(screen.getByRole("button", { name: "Errors" }));
    expect(onChange).toHaveBeenCalledWith({ observationKinds: [], statuses: ["error"] });

    fireEvent.click(screen.getByText("get_ticket"));
    expect(onSelectRun).toHaveBeenCalledWith(sampleRun);
  });
});
