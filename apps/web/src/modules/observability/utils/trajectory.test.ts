import type { TraceSpanSummary, TraceSummary } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { buildTrajectoryTurn, filterTrajectorySteps } from "./trajectory";

const trace: TraceSummary = {
  projectId: "project-1",
  traceId: "a".repeat(32),
  name: "ticket-triage",
  serviceName: "support",
  status: "ok",
  startedAt: "2026-08-05T00:00:00.000Z",
  endedAt: "2026-08-05T00:00:01.000Z",
  durationMs: 1_000,
  spanCount: 3,
  generationCount: 1,
  toolCount: 1,
  errorCount: 0,
  userId: "user-1",
  sessionId: "thread-1",
  tags: [],
  model: "gpt-4.1",
  inputPreview: "Summarize ticket TICKET-1001",
  outputPreview: "High severity checkout regression.",
  environment: "production",
  release: null,
  version: null,
  serviceVersion: null,
  inputTokens: 100,
  outputTokens: 40,
  totalTokens: 140,
  inputCost: 0.001,
  outputCost: 0.002,
  totalCost: 0.003,
  lastSeenAt: "2026-08-05T00:00:01.000Z",
};

function makeSpan(overrides: Partial<TraceSpanSummary>): TraceSpanSummary {
  return {
    traceId: trace.traceId,
    spanId: "1".repeat(16),
    parentSpanId: null,
    name: "agent.run",
    observationKind: "agent",
    status: "ok",
    startTimeUnixNano: "1791890199000000000",
    endTimeUnixNano: "1791890200000000000",
    durationNano: "1000000000",
    serviceName: "support",
    model: null,
    totalTokens: 0,
    totalCost: null,
    ...overrides,
  };
}

describe("trajectory builder", () => {
  it("extracts user input, child execution steps, and final assistant output for a single trace", () => {
    const root = makeSpan({
      spanId: "1".repeat(16),
      name: "agent.run",
      observationKind: "agent",
      inputPreview: "Summarize ticket TICKET-1001",
      outputPreview: "High severity checkout regression.",
    });
    const tool = makeSpan({
      spanId: "2".repeat(16),
      parentSpanId: root.spanId,
      name: "get_ticket",
      observationKind: "tool",
      startTimeUnixNano: "1791890199100000000",
      endTimeUnixNano: "1791890199300000000",
      durationNano: "200000000",
      inputPreview: '{"id":"TICKET-1001"}',
      outputPreview: '{"severity":"high"}',
    });
    const generation = makeSpan({
      spanId: "3".repeat(16),
      parentSpanId: root.spanId,
      name: "model.turn.1",
      observationKind: "generation",
      model: "gpt-4.1",
      startTimeUnixNano: "1791890199400000000",
      endTimeUnixNano: "1791890199900000000",
      durationNano: "500000000",
      totalTokens: 140,
      totalCost: 0.003,
      outputPreview: "High severity checkout regression.",
    });

    const turn = buildTrajectoryTurn({ trace, spans: [generation, root, tool] });

    expect(turn.userInput).toEqual({
      text: "Summarize ticket TICKET-1001",
      spanId: root.spanId,
      spanName: "agent.run",
    });
    expect(turn.assistantOutput).toEqual({
      text: "High severity checkout regression.",
      spanId: root.spanId,
      spanName: "agent.run",
    });
    expect(turn.steps.map((step) => step.span.name)).toEqual(["get_ticket", "model.turn.1"]);
    expect(filterTrajectorySteps(turn.steps, "ticket").map((step) => step.span.name)).toEqual([
      "get_ticket",
    ]);
  });

  it("preserves single-span traces as a step so nothing is hidden", () => {
    const only = makeSpan({
      spanId: "9".repeat(16),
      name: "llm.complete",
      observationKind: "generation",
      model: "gpt-4.1",
    });
    const turn = buildTrajectoryTurn({ trace, spans: [only] });
    expect(turn.steps).toHaveLength(1);
    expect(turn.steps[0]?.span.name).toBe("llm.complete");
  });
});
