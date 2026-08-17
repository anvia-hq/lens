import type { SpanDetail } from "@lens/contracts";
import { describe, expect, it } from "vitest";
import {
  buildExpandedTraceGraph,
  MAX_TRACE_GRAPH_EDGES,
  MAX_TRACE_GRAPH_NODES,
  TRACE_GRAPH_END_ID,
  TRACE_GRAPH_START_ID,
  traceGraphNodeMatches,
} from "./trace-graph";
import { normalizeTraceGraphLayout, traceGraphElkInput } from "./trace-graph-layout";

describe("expanded trace graph", () => {
  it("builds a deterministic start-to-end graph for sequential spans", () => {
    const graph = buildExpandedTraceGraph([
      span({
        spanId: "second",
        name: "second",
        startTimeUnixNano: nano(20),
        endTimeUnixNano: nano(30),
      }),
      span({
        spanId: "first",
        name: "first",
        startTimeUnixNano: nano(0),
        endTimeUnixNano: nano(10),
      }),
    ]);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      TRACE_GRAPH_START_ID,
      "first",
      "second",
      TRACE_GRAPH_END_ID,
    ]);
    expect(graph.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ["first", "second"],
      [TRACE_GRAPH_START_ID, "first"],
      ["second", TRACE_GRAPH_END_ID],
    ]);
  });

  it("infers parallel branches and their join", () => {
    const graph = buildExpandedTraceGraph([
      span({ spanId: "left", startTimeUnixNano: nano(0), endTimeUnixNano: nano(30) }),
      span({ spanId: "right", startTimeUnixNano: nano(0), endTimeUnixNano: nano(40) }),
      span({ spanId: "join", startTimeUnixNano: nano(50), endTimeUnixNano: nano(60) }),
    ]);
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);

    expect(edges).toContain(`${TRACE_GRAPH_START_ID}->left`);
    expect(edges).toContain(`${TRACE_GRAPH_START_ID}->right`);
    expect(edges).toContain("left->join");
    expect(edges).toContain("right->join");
    expect(edges).toContain(`join->${TRACE_GRAPH_END_ID}`);
  });

  it("uses hierarchy, filters events, and maps event selection to an included ancestor", () => {
    const graph = buildExpandedTraceGraph([
      span({ spanId: "root", name: "agent" }),
      span({
        spanId: "event",
        parentSpanId: "root",
        observationKind: "event",
        startTimeUnixNano: nano(10),
      }),
      span({
        spanId: "tool",
        parentSpanId: "event",
        observationKind: "tool",
        startTimeUnixNano: nano(20),
      }),
    ]);

    expect(graph.nodes.some((node) => node.id === "event")).toBe(false);
    expect(graph.edges.map((edge) => `${edge.from}->${edge.to}`)).toContain("root->tool");
    expect(graph.spanToNodeId.get("event")).toBe("root");
  });

  it("recovers orphaned and cyclic parents as graph roots", () => {
    const graph = buildExpandedTraceGraph([
      span({ spanId: "orphan", parentSpanId: "missing" }),
      span({ spanId: "a", parentSpanId: "b", startTimeUnixNano: nano(10) }),
      span({ spanId: "b", parentSpanId: "a", startTimeUnixNano: nano(20) }),
    ]);
    const edges = graph.edges.map((edge) => `${edge.from}->${edge.to}`);

    expect(edges).toContain(`${TRACE_GRAPH_START_ID}->a`);
    expect(edges).toContain(`${TRACE_GRAPH_START_ID}->b`);
    expect(edges).not.toContain("a->b");
    expect(edges).not.toContain("b->a");
  });

  it("returns an empty graph for events and enforces complexity budgets", () => {
    expect(buildExpandedTraceGraph([span({ observationKind: "event" })]).nodes).toEqual([]);
    const spans = Array.from({ length: MAX_TRACE_GRAPH_NODES + 1 }, (_, index) =>
      span({ spanId: `span-${index}`, startTimeUnixNano: nano(index) }),
    );
    expect(buildExpandedTraceGraph(spans).limitExceeded).toEqual({
      nodeCount: MAX_TRACE_GRAPH_NODES + 1,
      edgeCount: 0,
    });

    const wideTrace = [
      ...Array.from({ length: 101 }, (_, index) =>
        span({
          spanId: `first-${index}`,
          startTimeUnixNano: nano(0),
          endTimeUnixNano: nano(10),
        }),
      ),
      ...Array.from({ length: 101 }, (_, index) =>
        span({
          spanId: `second-${index}`,
          startTimeUnixNano: nano(20),
          endTimeUnixNano: nano(30),
        }),
      ),
    ];
    expect(buildExpandedTraceGraph(wideTrace).limitExceeded?.edgeCount).toBeGreaterThan(
      MAX_TRACE_GRAPH_EDGES,
    );
  });

  it("matches the same useful fields as span search", () => {
    const graph = buildExpandedTraceGraph([
      span({ name: "generate", model: "gpt-5", serviceName: "support-api" }),
    ]);
    const node = graph.nodes.find((item) => item.spanId);
    expect(node).toBeDefined();
    if (!node) throw new Error("Expected a span graph node");
    expect(traceGraphNodeMatches(node, "GPT-5")).toBe(true);
    expect(traceGraphNodeMatches(node, "support-api")).toBe(true);
    expect(traceGraphNodeMatches(node, "missing")).toBe(false);
  });
});

describe("trace graph layout model", () => {
  it("builds rightward ELK input and normalizes routed edge sections", () => {
    const graph = buildExpandedTraceGraph([span({ spanId: "root" })]);
    const input = traceGraphElkInput(graph);
    expect(input.layoutOptions["elk.direction"]).toBe("RIGHT");
    expect(input.children.find((node) => node.id === "root")).toMatchObject({
      width: 220,
      height: 72,
    });
    expect(
      normalizeTraceGraphLayout({
        width: 300,
        height: 100,
        children: [{ id: "root", x: 10, y: 20, width: 220, height: 72 }],
        edges: [
          {
            id: "edge",
            sections: [
              {
                startPoint: { x: 0, y: 0 },
                bendPoints: [{ x: 5, y: 0 }],
                endPoint: { x: 5, y: 10 },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      width: 300,
      height: 100,
      nodes: [{ id: "root", x: 10, y: 20, width: 220, height: 72 }],
      edges: [
        {
          id: "edge",
          paths: [
            [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 10 },
            ],
          ],
        },
      ],
    });
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
