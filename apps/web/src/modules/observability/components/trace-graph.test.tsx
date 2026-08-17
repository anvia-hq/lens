// @vitest-environment happy-dom

import type { SpanDetail } from "@lens/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraceGraphLayout } from "../utils/trace-graph-layout";
import { requestTraceGraphLayout } from "../utils/trace-graph-layout-client";
import TraceGraph from "./trace-graph";

vi.mock("../utils/trace-graph-layout-client", () => ({
  TraceGraphLayoutCancelledError: class TraceGraphLayoutCancelledError extends Error {},
  requestTraceGraphLayout: vi.fn(),
}));

const layout: TraceGraphLayout = {
  width: 620,
  height: 160,
  nodes: [
    { id: "__lens_trace_start__", x: 0, y: 62, width: 64, height: 36 },
    { id: "root", x: 100, y: 44, width: 220, height: 72 },
    { id: "tool", x: 360, y: 44, width: 220, height: 72 },
    { id: "__lens_trace_end__", x: 620, y: 62, width: 64, height: 36 },
  ],
  edges: [],
};

beforeEach(() => {
  vi.mocked(requestTraceGraphLayout).mockReset().mockResolvedValue(layout);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 500,
    height: 500,
    left: 0,
    right: 900,
    top: 0,
    width: 900,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("trace graph canvas", () => {
  it("renders nodes, keeps event selection on its ancestor, dims search misses, and selects spans", async () => {
    const onSelectSpan = vi.fn();
    render(
      <div className="h-[500px]">
        <TraceGraph
          search="root"
          selectedSpanId="event"
          spans={[
            span({ spanId: "root", name: "root" }),
            span({
              spanId: "event",
              parentSpanId: "root",
              name: "event",
              observationKind: "event",
            }),
            span({
              spanId: "tool",
              parentSpanId: "event",
              name: "tool",
              observationKind: "tool",
            }),
          ]}
          onSelectSpan={onSelectSpan}
        />
      </div>,
    );

    const root = await screen.findByRole("button", { name: "root, agent, ok" });
    const tool = screen.getByRole("button", { name: "tool, tool, ok" });
    expect(root.getAttribute("aria-pressed")).toBe("true");
    expect(tool.className).toContain("opacity-20");
    fireEvent.click(tool);
    expect(onSelectSpan).toHaveBeenCalledWith("tool");
    expect(screen.getByRole("button", { name: "Zoom graph in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom graph out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fit graph to view" })).toBeTruthy();
  });

  it("shows a recoverable layout error", async () => {
    vi.mocked(requestTraceGraphLayout).mockRejectedValueOnce(new Error("layout failed"));
    render(
      <div className="h-[500px]">
        <TraceGraph
          search=""
          spans={[span({ spanId: "root", name: "root" })]}
          onSelectSpan={() => undefined}
        />
      </div>,
    );

    expect(await screen.findByText("Unable to lay out graph")).toBeTruthy();
    vi.mocked(requestTraceGraphLayout).mockResolvedValueOnce(layout);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "root, agent, ok" })).toBeTruthy();
  });

  it("keeps the existing layout when live span data changes without changing graph shape", async () => {
    const { rerender } = render(
      <div className="h-[500px]">
        <TraceGraph
          search=""
          spans={[span({ spanId: "root", name: "root" })]}
          onSelectSpan={() => undefined}
        />
      </div>,
    );

    expect(await screen.findByRole("button", { name: "root, agent, ok" })).toBeTruthy();
    expect(requestTraceGraphLayout).toHaveBeenCalledTimes(1);

    rerender(
      <div className="h-[500px]">
        <TraceGraph
          search=""
          spans={[span({ spanId: "root", name: "root", status: "error" })]}
          onSelectSpan={() => undefined}
        />
      </div>,
    );

    expect(await screen.findByRole("button", { name: "root, agent, error" })).toBeTruthy();
    expect(requestTraceGraphLayout).toHaveBeenCalledTimes(1);

    rerender(
      <div className="h-[500px]">
        <TraceGraph
          search=""
          spans={[
            span({ spanId: "root", name: "root", status: "error" }),
            span({ spanId: "tool", name: "tool", parentSpanId: "root" }),
          ]}
          onSelectSpan={() => undefined}
        />
      </div>,
    );

    await waitFor(() => expect(requestTraceGraphLayout).toHaveBeenCalledTimes(2));
  });
});

const baseMs = Date.parse("2026-08-05T00:00:00.000Z");

function nano(offsetMs: number): string {
  return String(BigInt(baseMs + offsetMs) * 1_000_000n);
}

function span(overrides: Partial<SpanDetail> = {}): SpanDetail {
  return {
    traceId: "trace-1",
    spanId: "span-1",
    parentSpanId: null,
    traceState: "",
    name: "agent.run",
    kind: 1,
    observationKind: "agent",
    status: "ok",
    statusMessage: "",
    startTimeUnixNano: nano(0),
    endTimeUnixNano: nano(100),
    durationNano: "100000000",
    serviceName: "support",
    scopeName: "test",
    scopeVersion: "1.0.0",
    resourceAttributes: {},
    spanAttributes: {},
    events: [],
    links: [],
    traceName: "support-agent",
    userId: null,
    sessionId: "session-1",
    tags: [],
    version: null,
    environment: "production",
    release: null,
    serviceVersion: null,
    model: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: null,
    outputCost: null,
    totalCost: null,
    input: null,
    output: null,
    ingestedAt: new Date(baseMs + 100).toISOString(),
    ...overrides,
  };
}
