// @vitest-environment happy-dom

import type { TraceDetail, TraceSpanSummary } from "@lens/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildTraceSpanForest } from "../utils/trace-detail";
import { TraceNavigator } from "./trace-navigator";

afterEach(cleanup);

describe("large trace virtualization", () => {
  it("keeps the rendered tree bounded for 10,000 spans", () => {
    const detail = largeTrace(10_000);
    render(
      <div className="h-[600px]">
        <TraceNavigator
          collapsed={new Set()}
          detail={detail}
          forest={buildTraceSpanForest(detail)}
          search=""
          view="tree"
          onCollapsedChange={() => undefined}
          onSearchChange={() => undefined}
          onSelectSpan={() => undefined}
          onViewChange={() => undefined}
        />
      </div>,
    );
    const rows = screen.getAllByRole("treeitem");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
  });
});

function largeTrace(count: number): TraceDetail {
  const startedAt = Date.parse("2026-08-20T00:00:00.000Z");
  const spans: TraceSpanSummary[] = Array.from({ length: count }, (_, index) => ({
    traceId: "trace-1",
    spanId: `span-${index}`,
    parentSpanId: index === 0 ? null : `span-${index - 1}`,
    name: `span ${index}`,
    observationKind: "span",
    status: "ok",
    startTimeUnixNano: String(BigInt(startedAt + index) * 1_000_000n),
    endTimeUnixNano: String(BigInt(startedAt + index + 1) * 1_000_000n),
    durationNano: "1000000",
    serviceName: "test",
    model: null,
    totalTokens: 0,
    totalCost: null,
  }));
  return {
    evaluations: [],
    spans,
    summary: {
      projectId: "project-1",
      traceId: "trace-1",
      name: "large trace",
      serviceName: "test",
      status: "ok",
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(startedAt + count).toISOString(),
      durationMs: count,
      spanCount: count,
      generationCount: 0,
      toolCount: 0,
      errorCount: 0,
      userId: null,
      sessionId: null,
      tags: [],
      model: null,
      environment: "test",
      release: null,
      version: null,
      serviceVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCost: null,
      outputCost: null,
      totalCost: null,
      lastSeenAt: new Date(startedAt + count).toISOString(),
    },
  };
}
