import type { ExpandedTraceGraph } from "./trace-graph";

export const TRACE_GRAPH_NODE_WIDTH = 220;
export const TRACE_GRAPH_NODE_HEIGHT = 72;
export const TRACE_GRAPH_SYSTEM_NODE_WIDTH = 64;
export const TRACE_GRAPH_SYSTEM_NODE_HEIGHT = 36;
export const TRACE_GRAPH_LAYOUT_TIMEOUT_MS = 15_000;

export type TraceGraphPoint = { x: number; y: number };

export type TraceGraphLayout = {
  width: number;
  height: number;
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  edges: Array<{
    id: string;
    paths: TraceGraphPoint[][];
  }>;
};

export type ElkGraphResult = {
  width?: number;
  height?: number;
  children?: Array<{
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
  edges?: Array<{
    id: string;
    sections?: Array<{
      startPoint: TraceGraphPoint;
      bendPoints?: TraceGraphPoint[];
      endPoint: TraceGraphPoint;
    }>;
  }>;
};

export function traceGraphElkInput(graph: ExpandedTraceGraph) {
  return {
    id: "trace-graph-root",
    layoutOptions: {
      "elk.algorithm": "org.eclipse.elk.layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.layered.spacing.nodeNodeBetweenLayers": "88",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.edgeNode": "28",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: node.spanId ? TRACE_GRAPH_NODE_WIDTH : TRACE_GRAPH_SYSTEM_NODE_WIDTH,
      height: node.spanId ? TRACE_GRAPH_NODE_HEIGHT : TRACE_GRAPH_SYSTEM_NODE_HEIGHT,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };
}

export function normalizeTraceGraphLayout(result: ElkGraphResult): TraceGraphLayout {
  return {
    width: finiteNumber(result.width),
    height: finiteNumber(result.height),
    nodes: (result.children ?? []).map((node) => ({
      id: node.id,
      x: finiteNumber(node.x),
      y: finiteNumber(node.y),
      width: finiteNumber(node.width),
      height: finiteNumber(node.height),
    })),
    edges: (result.edges ?? []).map((edge) => ({
      id: edge.id,
      paths: (edge.sections ?? []).map((section) => [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]),
    })),
  };
}

function finiteNumber(value: number | undefined): number {
  return Number.isFinite(value) ? (value ?? 0) : 0;
}
