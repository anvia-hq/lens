// @vitest-environment happy-dom

import type { SpanDetail, TraceDetail } from "@lens/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TraceComparePanel } from "./trace-compare-panel";

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

describe("trace comparison panel", () => {
  it("keeps the span tree primary and opens span data inside the tile", () => {
    render(<TraceComparePanel detail={detail()} projectId="project-1" />);

    expect(screen.getByRole("region", { name: "Trace spans" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Selected span data" })).toBeNull();

    fireEvent.click(screen.getByText("agent.run"));
    expect(screen.getByRole("region", { name: "Selected span data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to spans" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to spans" }));
    expect(screen.queryByRole("region", { name: "Selected span data" })).toBeNull();
    expect(screen.getByRole("region", { name: "Trace spans" })).toBeTruthy();
  });
});

const baseMs = Date.parse("2026-08-05T00:00:00.000Z");

function detail(): TraceDetail {
  const spans = [span()];
  return {
    summary: {
      projectId: "project-1",
      traceId: "trace-1",
      name: "support-agent",
      serviceName: "support",
      status: "ok",
      startedAt: new Date(baseMs).toISOString(),
      endedAt: new Date(baseMs + 100).toISOString(),
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
      lastSeenAt: new Date(baseMs + 100).toISOString(),
    },
    spans,
  };
}

function span(): SpanDetail {
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
    startTimeUnixNano: String(BigInt(baseMs) * 1_000_000n),
    endTimeUnixNano: String(BigInt(baseMs + 100) * 1_000_000n),
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
    sessionId: null,
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
    input: { prompt: "Hello" },
    output: { answer: "Hi" },
    ingestedAt: new Date(baseMs + 100).toISOString(),
  };
}
