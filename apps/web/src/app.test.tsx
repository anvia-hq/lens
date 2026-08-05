// @vitest-environment happy-dom

import { ChartContainer } from "@lens/ui/components/chart";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Area, AreaChart } from "recharts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adaptiveRefreshInterval,
  ComparisonMetricCard,
  comparisonDelta,
  defaultTraceColumns,
  RangeSelector,
  refreshMilliseconds,
  TraceExplorerTable,
  validateOverviewSearch,
  validateTraceDetailSearch,
  validateTracesSearch,
} from "./app";

afterEach(cleanup);

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

  it("selects ranges and exposes the active preset", () => {
    const onChange = vi.fn();
    render(<RangeSelector value="7d" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "7d" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    expect(onChange).toHaveBeenCalledWith("30d");
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

  it("uses adaptive refresh and meaningful comparison labels", () => {
    expect(adaptiveRefreshInterval("24h")).toBe("5s");
    expect(adaptiveRefreshInterval("30d")).toBe("30s");
    expect(refreshMilliseconds("10s")).toBe(10_000);
    expect(refreshMilliseconds("Off")).toBe(false);
    expect(comparisonDelta(10, 0, "relative").label).toBe("New");
    expect(comparisonDelta(0.08, 0.1, "points").label).toBe("↓ 2.0 pp");
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
});
