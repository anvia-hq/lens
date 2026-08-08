// @vitest-environment happy-dom

import { ChartContainer } from "@lens/ui/components/chart";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Area, AreaChart } from "recharts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOverviewSearch } from "../../routes/$projectId";
import { validateEvaluationsSearch } from "../../routes/$projectId/evaluations";
import { validateEvaluationCompareSearch } from "../../routes/$projectId/evaluations/compare";
import { validateEvaluationResultsSearch } from "../../routes/$projectId/evaluations/results";
import { validateEvaluationRunsSearch } from "../../routes/$projectId/evaluations/runs";
import { validateSessionsSearch } from "../../routes/$projectId/sessions";
import { validateTracesSearch } from "../../routes/$projectId/traces";
import { validateTraceDetailSearch } from "../../routes/$projectId/traces/$traceId";
import { validateTraceCompareSearch } from "../../routes/$projectId/traces/compare";
import { validateUsersSearch } from "../../routes/$projectId/users";
import { validateUserDetailSearch } from "../../routes/$projectId/users/$userId";
import { ComparisonMetricCard } from "./components/comparison-metric-card";
import { LiveBadge } from "./components/live-badge";
import { RangeSelector } from "./components/range-selector";
import { SessionExplorerTable } from "./components/session-explorer-table";
import { StatusBadge } from "./components/status-badge";
import { TraceExplorerTable } from "./components/trace-explorer-table";
import { UserRangeSelector } from "./components/user-range-selector";
import {
  evaluationDatasetDetailPath,
  evaluationDatasetsPath,
  UNVERSIONED_DATASET,
} from "./hooks/use-evaluation-datasets";
import { assignComparisonRuns } from "./hooks/use-evaluation-runs";
import {
  defaultEvaluationResultColumns,
  defaultEvaluationRunColumns,
  defaultSessionColumns,
  defaultTraceColumns,
  defaultUserColumns,
} from "./types";
import { adaptiveRefreshInterval, comparisonDelta, refreshMilliseconds } from "./utils";

afterEach(cleanup);

describe("evaluation dataset requests", () => {
  it("separates dataset paths from their encoded query parameters", () => {
    expect(evaluationDatasetsPath("project-1", { page: 2, search: "support cases" })).toBe(
      "/api/v1/projects/project-1/evaluation-datasets?search=support+cases&page=2&pageSize=25",
    );
    expect(
      evaluationDatasetDetailPath("project-1", {
        dataset: "support/cases",
        version: "v1 beta",
      }),
    ).toBe(
      "/api/v1/projects/project-1/evaluation-datasets/detail?name=support%2Fcases&version=v1+beta",
    );
    expect(
      evaluationDatasetDetailPath("project-1", {
        dataset: "support-cases",
        version: UNVERSIONED_DATASET,
      }),
    ).toBe(
      "/api/v1/projects/project-1/evaluation-datasets/detail?name=support-cases&unversioned=1",
    );
  });
});

describe("overview controls", () => {
  it("renders chart SVG geometry through the shared chart container", async () => {
    const rectangle = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 320,
      bottom: 200,
      width: 320,
      height: 200,
      toJSON: () => ({}),
    };
    const rectangleMock = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(rectangle);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          this.callback(
            [{ target, contentRect: rectangle } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
        unobserve() {}
      },
    );
    const { container } = render(
      <ChartContainer config={{ traces: { color: "red" } }}>
        <AreaChart
          data={[
            { timestamp: "2026-08-05T12:00:00.000Z", traces: 4 },
            { timestamp: "2026-08-05T13:00:00.000Z", traces: 8 },
          ]}
        >
          <Area dataKey="traces" fill="var(--color-traces)" />
        </AreaChart>
      </ChartContainer>,
    );

    await waitFor(() => expect(container.querySelector("svg.recharts-surface")).toBeTruthy());
    expect(container.querySelector("svg.recharts-surface path")).toBeTruthy();
    rectangleMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("normalizes range and trace drilldown search parameters", () => {
    expect(validateOverviewSearch({ range: "7d" })).toEqual({ range: "7d" });
    expect(validateOverviewSearch({ range: "90d" })).toEqual({ range: "24h" });
    expect(validateTraceDetailSearch({ view: "timeline", span: " span-1 " })).toEqual({
      view: "timeline",
      span: "span-1",
    });
    expect(validateTraceDetailSearch({ view: "graph", span: "" })).toEqual({
      view: undefined,
      span: undefined,
    });
    expect(validateSessionsSearch({ range: "7d", status: "error", user: " user-1 " })).toEqual({
      range: "7d",
      statuses: ["error"],
      users: ["user-1"],
      services: [],
      models: [],
      environments: [],
      tags: [],
      search: undefined,
      minDurationMs: undefined,
      maxDurationMs: undefined,
      minTotalTokens: undefined,
      maxTotalTokens: undefined,
      minTotalCost: undefined,
      maxTotalCost: undefined,
      sort: "startedAt",
      order: "desc",
      page: 1,
      pageSize: 50,
      columns: defaultSessionColumns,
    });
    expect(
      validateTracesSearch({ range: "30d", status: "error", model: " gpt-4.1 ", service: "" }),
    ).toEqual({
      range: "30d",
      statuses: ["error"],
      services: [],
      names: [],
      models: ["gpt-4.1"],
      environments: [],
      releases: [],
      versions: [],
      serviceVersions: [],
      tags: [],
      userId: undefined,
      sessionId: undefined,
      traceId: undefined,
      search: undefined,
      minDurationMs: undefined,
      maxDurationMs: undefined,
      minTotalTokens: undefined,
      maxTotalTokens: undefined,
      minTotalCost: undefined,
      maxTotalCost: undefined,
      sort: "startedAt",
      order: "desc",
      page: 1,
      pageSize: 50,
      columns: defaultTraceColumns,
    });
  });

  it("normalizes evaluation workspace views and comparison identifiers", () => {
    expect(
      validateEvaluationsSearch({
        view: "compare",
        candidateRunId: " candidate ",
        baselineRunId: " baseline ",
        gateId: " gate ",
      }),
    ).toMatchObject({
      view: "compare",
      candidateRunId: "candidate",
      baselineRunId: "baseline",
      gateId: "gate",
    });
    expect(validateEvaluationsSearch({ view: "unsupported" }).view).toBe("runs");
    expect(
      validateEvaluationRunsSearch({
        range: "7d",
        status: "completed",
        suite: " release-gate ",
        columns: ["suite", "passRate"],
        sort: "passRate",
      }),
    ).toMatchObject({
      range: "7d",
      statuses: ["completed"],
      suites: ["release-gate"],
      columns: ["suite", "passRate"],
      sort: "passRate",
      order: "desc",
      page: 1,
      pageSize: 50,
    });
    expect(validateEvaluationRunsSearch({}).columns).toEqual(defaultEvaluationRunColumns);
    expect(defaultEvaluationRunColumns.slice(0, 2)).toEqual(["startedAt", "runId"]);
    expect(
      validateEvaluationResultsSearch({
        outcome: ["pass", "unknown-value"],
        metric: "correctness",
      }),
    ).toMatchObject({
      outcomes: ["pass"],
      metrics: ["correctness"],
      columns: defaultEvaluationResultColumns,
    });
    expect(defaultEvaluationResultColumns.slice(0, 2)).toEqual(["timestamp", "resultId"]);
    expect(validateEvaluationResultsSearch({ columns: ["suiteCase", "outcome"] }).columns).toEqual([
      "suite",
      "case",
      "outcome",
    ]);
    expect(
      validateEvaluationCompareSearch({
        candidateRunId: " candidate ",
        baselineRunId: " baseline ",
      }),
    ).toEqual({
      candidateRunId: "candidate",
      baselineRunId: "baseline",
      gateId: undefined,
    });
  });

  it("assigns the newer selected evaluation run as the candidate", () => {
    const baseline = { id: "baseline", startedAt: "2026-08-01T00:00:00.000Z" };
    const candidate = { id: "candidate", startedAt: "2026-08-02T00:00:00.000Z" };
    expect(
      assignComparisonRuns([candidate, baseline] as Parameters<typeof assignComparisonRuns>[0]),
    ).toEqual({ baseline, candidate });
    expect(assignComparisonRuns([candidate] as Parameters<typeof assignComparisonRuns>[0])).toBe(
      undefined,
    );
  });

  it("normalizes ordered comparison trace IDs and enforces the maximum", () => {
    expect(
      validateTraceCompareSearch({
        traceIds: [" trace-1 ", "trace-2", "trace-1", "trace-3", "trace-4", "trace-5"],
      }),
    ).toEqual({ traceIds: ["trace-1", "trace-2", "trace-3", "trace-4"] });
    expect(validateTraceCompareSearch({ traceIds: " trace-1 " })).toEqual({
      traceIds: ["trace-1"],
    });
    expect(validateTraceCompareSearch({ traceIds: 42 })).toEqual({ traceIds: [] });
  });

  it("selects ranges and exposes the active preset", () => {
    const onChange = vi.fn();
    render(<RangeSelector value="7d" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "7d" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    expect(onChange).toHaveBeenCalledWith("30d");
  });

  it("normalizes user list and detail search state", () => {
    expect(validateUsersSearch({})).toEqual({
      range: "all",
      search: undefined,
      sort: "lastSeenAt",
      order: "desc",
      page: 1,
      pageSize: 50,
      columns: defaultUserColumns,
    });
    expect(validateUserDetailSearch({ range: "7d", tab: "sessions", sort: "totalCost" })).toEqual({
      range: "7d",
      tab: "sessions",
      sort: "totalCost",
      order: "desc",
      page: 1,
      pageSize: 50,
    });
    expect(validateUserDetailSearch({ tab: "traces", sort: "sessionId" }).sort).toBe("sessionId");
  });

  it("supports all-time user ranges", () => {
    const onChange = vi.fn();
    render(<UserRangeSelector value="all" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "24h" }));
    expect(onChange).toHaveBeenCalledWith("24h");
  });

  it("opens the trace column chooser within a valid Base UI menu group", async () => {
    render(
      <TraceExplorerTable
        filters={{
          range: "24h",
          sort: "startedAt",
          order: "desc",
          page: 1,
          pageSize: 50,
          columns: defaultTraceColumns,
        }}
        searchDraft=""
        onSearchChange={() => undefined}
        data={{ items: [], total: 0, page: 1, pageSize: 50, pageCount: 0 }}
        loading={false}
        error={null}
        activeFilterCount={0}
        onOpenMobileFilters={() => undefined}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    expect(await screen.findByText("Visible columns")).toBeTruthy();
  });

  it("enables comparison for two selected traces and clears the selection", () => {
    const onCompare = vi.fn();
    const onClearSelection = vi.fn();
    const props = {
      filters: {
        range: "24h" as const,
        sort: "startedAt" as const,
        order: "desc" as const,
        page: 1,
        pageSize: 50 as const,
        columns: defaultTraceColumns,
      },
      searchDraft: "",
      onSearchChange: () => undefined,
      data: { items: [], total: 0, page: 1, pageSize: 50, pageCount: 0 },
      loading: false,
      error: null,
      activeFilterCount: 0,
      onOpenMobileFilters: () => undefined,
      onChange: () => undefined,
      onCompare,
      onClearSelection,
    };
    const { rerender } = render(<TraceExplorerTable {...props} selectedTraceIds={["trace-1"]} />);

    expect(screen.getByRole("button", { name: /Compare \(1\)/ }).hasAttribute("disabled")).toBe(
      true,
    );
    rerender(<TraceExplorerTable {...props} selectedTraceIds={["trace-1", "trace-2"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Compare \(2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onCompare).toHaveBeenCalledOnce();
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("opens the session column chooser within a valid Base UI menu group", async () => {
    render(
      <SessionExplorerTable
        filters={{
          range: "24h",
          sort: "startedAt",
          order: "desc",
          page: 1,
          pageSize: 50,
          columns: defaultSessionColumns,
        }}
        searchDraft=""
        onSearchChange={() => undefined}
        data={{ items: [], total: 0, page: 1, pageSize: 50, pageCount: 0 }}
        loading={false}
        error={null}
        activeFilterCount={0}
        onOpenMobileFilters={() => undefined}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    expect(await screen.findByText("Visible columns")).toBeTruthy();
  });

  it("uses adaptive refresh and meaningful comparison labels", () => {
    expect(adaptiveRefreshInterval("24h")).toBe("5s");
    expect(adaptiveRefreshInterval("30d")).toBe("30s");
    expect(refreshMilliseconds("10s")).toBe(10_000);
    expect(refreshMilliseconds("Off")).toBe(false);
    expect(comparisonDelta(10, 0, "relative")).toMatchObject({
      label: "No prior baseline",
      accessibleLabel: "No prior baseline",
      hasPreviousPeriodComparison: false,
    });
    expect(comparisonDelta(0.08, 0.1, "points").label).toBe("↓ 2.0 pp");
  });

  it("opens the refresh interval menu", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <LiveBadge interval="5s" onIntervalChange={() => undefined} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh interval" }));

    expect(await screen.findByText("Refresh interval")).toBeTruthy();
    expect(screen.getByText("Every 10s")).toBeTruthy();
  });

  it("uses opaque borderless colors for status badges", () => {
    const { rerender } = render(<StatusBadge status="ok" />);
    expect(screen.getByText("Success").className).toContain("border-0");
    expect(screen.getByText("Success").className).toContain("bg-emerald-200");

    rerender(<StatusBadge status="error" />);
    expect(screen.getByText("Error").className).toContain("border-0");
    expect(screen.getByText("Error").className).toContain("bg-rose-200");
  });

  it("renders previous-period context on metric cards", () => {
    render(
      <ComparisonMetricCard
        label="Total tokens"
        value="1,200"
        current={1_200}
        previous={1_000}
        icon={<span>icon</span>}
      />,
    );

    expect(screen.getByText("Total tokens")).toBeTruthy();
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText(/20.0 percent up/)).toBeTruthy();
  });

  it("renders a standalone message when there is no prior baseline", () => {
    render(
      <ComparisonMetricCard
        label="Generations"
        value="10"
        current={10}
        previous={0}
        icon={<span>icon</span>}
      />,
    );

    expect(
      screen.getByText("No prior baseline", { selector: '[aria-hidden="true"]' }),
    ).toBeTruthy();
    expect(screen.queryByText("vs previous period")).toBeNull();
    expect(screen.queryByText(/compared with the previous period/)).toBeNull();
  });
});
