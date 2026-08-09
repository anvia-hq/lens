// @vitest-environment happy-dom

import type { SpanDetail, TraceDetail } from "@lens/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpanForest,
  flattenSpanForest,
  formattedPayloadRows,
  jsonSyntaxTokens,
  rawTraceJson,
  searchTraceSpans,
  spanTimelinePosition,
  traceTimelineBounds,
} from "../utils/trace-detail";
import { SpanInspector } from "./span-inspector";
import { TraceDetailExplorer } from "./trace-detail-explorer";
import { TraceNavigator } from "./trace-navigator";

afterEach(cleanup);

describe("trace detail model", () => {
  it("builds chronological span trees and recovers orphans and cycles", () => {
    const parent = span({ spanId: "parent", name: "parent", startTimeUnixNano: nano(0) });
    const child = span({
      spanId: "child",
      parentSpanId: "parent",
      name: "child",
      startTimeUnixNano: nano(10),
    });
    const orphan = span({
      spanId: "orphan",
      parentSpanId: "missing",
      name: "orphan",
      startTimeUnixNano: nano(20),
    });

    const forest = buildSpanForest([child, orphan, parent]);
    expect(forest.map((node) => node.span.spanId)).toEqual(["parent", "orphan"]);
    expect(forest[0]?.children.map((node) => node.span.spanId)).toEqual(["child"]);
    expect(flattenSpanForest(forest).map((row) => [row.span.spanId, row.depth])).toEqual([
      ["parent", 0],
      ["child", 1],
      ["orphan", 0],
    ]);
    expect(flattenSpanForest(forest, new Set(["parent"])).map((row) => row.span.spanId)).toEqual([
      "parent",
      "orphan",
    ]);

    const cycle = buildSpanForest([
      span({ spanId: "a", parentSpanId: "b" }),
      span({ spanId: "b", parentSpanId: "a", startTimeUnixNano: nano(1) }),
    ]);
    expect(flattenSpanForest(cycle).map((row) => row.span.spanId)).toEqual(["a", "b"]);
  });

  it("searches useful span fields and calculates safe timeline geometry", () => {
    const subject = detail([
      span({ spanId: "root", name: "agent.run", serviceName: "support", model: null }),
      span({
        spanId: "generation",
        parentSpanId: "root",
        name: "model.generate",
        observationKind: "generation",
        model: "gpt-4.1",
        startTimeUnixNano: nano(25),
        endTimeUnixNano: nano(75),
        durationNano: durationNano(50),
      }),
    ]);

    expect(searchTraceSpans(subject.spans, "GPT-4.1").map((item) => item.spanId)).toEqual([
      "generation",
    ]);
    expect(searchTraceSpans(subject.spans, "support")).toHaveLength(2);
    const bounds = traceTimelineBounds(subject);
    const generation = subject.spans[1];
    expect(generation).toBeDefined();
    expect(bounds.durationMs).toBe(100);
    if (generation === undefined) throw new Error("Generation fixture was not created");
    expect(spanTimelinePosition(generation, bounds)).toEqual({ left: 180, width: 360 });
    expect(
      spanTimelinePosition(
        span({ durationNano: "0", startTimeUnixNano: nano(100), endTimeUnixNano: nano(100) }),
        bounds,
      ).width,
    ).toBe(2);
  });

  it("formats message payloads and tokenizes raw JSON", () => {
    const value = {
      instructions: "Answer clearly.",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
    };
    expect(formattedPayloadRows("Input", value)).toEqual([
      { key: "instructions", label: "System", role: "system", text: "Answer clearly." },
      { key: "Messages:0", label: "User", role: "user", text: "Hello" },
      { key: "Messages:1", label: "Assistant", role: "assistant", text: "Hi" },
    ]);
    expect(rawTraceJson(value)).toContain('"messages"');
    expect(jsonSyntaxTokens('{"ok":true,"count":2}').map((token) => token.type)).toContain("key");
    expect(jsonSyntaxTokens('{"ok":true,"count":2}').map((token) => token.type)).toContain(
      "boolean",
    );
  });
});

describe("trace detail controls", () => {
  it("renders connector lines, collapses branches, searches, and switches timeline mode", () => {
    const subject = detail([
      span({ spanId: "root", name: "agent.run" }),
      span({
        spanId: "turn-1",
        parentSpanId: "root",
        name: "turn.1",
        startTimeUnixNano: nano(10),
      }),
      span({
        spanId: "generation",
        parentSpanId: "turn-1",
        name: "model.generate",
        observationKind: "generation",
        startTimeUnixNano: nano(20),
      }),
      span({
        spanId: "turn-2",
        parentSpanId: "root",
        name: "turn.2",
        startTimeUnixNano: nano(30),
      }),
      span({
        spanId: "failed-tool",
        parentSpanId: "turn-2",
        name: "tool.read_file",
        observationKind: "tool",
        status: "error",
        startTimeUnixNano: nano(40),
      }),
    ]);
    const forest = buildSpanForest(subject.spans);

    function Harness() {
      const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
      const [search, setSearch] = useState("");
      const [view, setView] = useState<"tree" | "timeline">("tree");
      return (
        <div className="h-[600px]">
          <TraceNavigator
            collapsed={collapsed}
            detail={subject}
            forest={forest}
            search={search}
            selectedSpanId="root"
            view={view}
            onCollapsedChange={setCollapsed}
            onSearchChange={setSearch}
            onSelectSpan={() => undefined}
            onViewChange={setView}
          />
        </div>
      );
    }

    const { container } = render(<Harness />);
    expect(screen.getByText("model.generate")).toBeTruthy();
    expect(container.querySelector('[data-tree-line="elbow"]')).toBeTruthy();
    expect(
      container.querySelector('[data-tree-depth="2"] [data-tree-line="ancestor"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse agent.run" }));
    expect(screen.queryByText("model.generate")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand agent.run" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search spans" }), {
      target: { value: "generate" },
    });
    expect(screen.getByLabelText("Span search results")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search spans" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Timeline view" }));
    expect(screen.getByRole("region", { name: "Span timeline" })).toBeTruthy();
    const failedToolRow = screen.getByText("tool.read_file").closest("button");
    expect(failedToolRow?.querySelector(".bg-amber-600")).toBeTruthy();
    expect(screen.getByText("ERROR")).toBeTruthy();
  });

  it("switches the whole selected-span preview between formatted and JSON", () => {
    const subject = span({
      input: [{ role: "user", content: "Hello" }],
      output: { role: "assistant", content: "Hi" },
    });
    const onViewChange = vi.fn();
    const rendered = render(
      <SpanInspector span={subject} payloadView="formatted" onPayloadViewChange={onViewChange} />,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("Hi")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(onViewChange).toHaveBeenCalledWith("json");

    rendered.rerender(
      <SpanInspector span={subject} payloadView="json" onPayloadViewChange={onViewChange} />,
    );
    expect(screen.getByRole("button", { name: "Copy Input JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy Output JSON" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy Metadata JSON" })).toBeTruthy();
  });

  it("renders the complete desktop explorer without a card wrapper", () => {
    const subject = detail([span({ spanId: "root", input: { prompt: "Hello" } })]);
    subject.summary.sessionId = null;
    render(
      <TraceDetailExplorer
        detail={subject}
        projectId={subject.summary.projectId}
        selectedSpanId="root"
        view="tree"
        onSelectSpan={() => undefined}
        onViewChange={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "support-agent" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Trace spans" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Selected span data" })).toBeTruthy();
  });
});

function detail(spans: SpanDetail[]): TraceDetail {
  return {
    evaluations: [],
    summary: {
      projectId: "00000000-0000-0000-0000-000000000001",
      traceId: "trace-1",
      name: "support-agent",
      serviceName: "support",
      status: "ok",
      startedAt: new Date(baseMs).toISOString(),
      endedAt: new Date(baseMs + 100).toISOString(),
      durationMs: 100,
      spanCount: spans.length,
      generationCount: spans.filter((item) => item.observationKind === "generation").length,
      toolCount: spans.filter((item) => item.observationKind === "tool").length,
      errorCount: spans.filter((item) => item.status === "error").length,
      userId: null,
      sessionId: "session-1",
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
      lastSeenAt: new Date(baseMs + 100).toISOString(),
    },
    spans,
  };
}

const baseMs = Date.parse("2026-08-05T00:00:00.000Z");

function nano(offsetMs: number): string {
  return String(BigInt(baseMs + offsetMs) * 1_000_000n);
}

function durationNano(ms: number): string {
  return String(BigInt(ms) * 1_000_000n);
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
    durationNano: durationNano(100),
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
