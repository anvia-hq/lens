import type { ObservationKind, SpanDetail, SpanStatus } from "@lens/contracts";
import { spanDurationMs } from "./trace-detail";

export const TRACE_GRAPH_START_ID = "__lens_trace_start__";
export const TRACE_GRAPH_END_ID = "__lens_trace_end__";
export const MAX_TRACE_GRAPH_NODES = 2_500;
export const MAX_TRACE_GRAPH_EDGES = 10_000;

export type TraceGraphNode = {
  id: string;
  label: string;
  kind: ObservationKind | "system";
  status: SpanStatus;
  durationMs: number;
  totalTokens: number;
  totalCost: number | null;
  spanId?: string;
  serviceName?: string;
  model?: string | null;
};

export type TraceGraphEdge = {
  id: string;
  from: string;
  to: string;
};

export type ExpandedTraceGraph = {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  spanToNodeId: Map<string, string>;
  limitExceeded?: {
    nodeCount: number;
    edgeCount: number;
  };
};

type EdgeDraft = { from: string; to: string };

export function buildExpandedTraceGraph(spans: SpanDetail[]): ExpandedTraceGraph {
  const allById = new Map<string, SpanDetail>();
  for (const span of spans) {
    if (!allById.has(span.spanId)) allById.set(span.spanId, span);
  }

  const included = [...allById.values()]
    .filter((span) => span.observationKind !== "event")
    .sort(compareGraphSpans);
  if (included.length === 0) {
    return { nodes: [], edges: [], spanToNodeId: new Map() };
  }
  if (included.length > MAX_TRACE_GRAPH_NODES) {
    return limitedGraph(included.length, 0);
  }

  const includedIds = new Set(included.map((span) => span.spanId));
  const groups = new Map<string | null, SpanDetail[]>();
  for (const span of included) {
    const parentId = nearestIncludedParent(span, allById, includedIds);
    const group = groups.get(parentId);
    if (group) group.push(span);
    else groups.set(parentId, [span]);
  }

  const edgeDrafts: EdgeDraft[] = [];
  const rootSiblingSources = new Set<string>();
  const pushEdge = (from: string, to: string) => {
    edgeDrafts.push({ from, to });
    return edgeDrafts.length <= MAX_TRACE_GRAPH_EDGES;
  };

  for (const [parentId, group] of groups) {
    const ordered = [...group].sort(compareGraphSpans);
    const starts = ordered.map((span) => spanTimes(span).start);
    const ends = ordered.map((span) => spanTimes(span).end);

    for (let currentIndex = 0; currentIndex < ordered.length; currentIndex += 1) {
      const current = ordered[currentIndex];
      if (!current) continue;
      const currentStart = starts[currentIndex] ?? 0n;
      let finishedCount = 0;
      let latestEnd = -1n;
      let fallbackIndex = -1;
      let greatestStart = -1n;
      let greatestStartIndex = -1;
      let secondGreatestStart = -1n;

      for (let candidateIndex = 0; candidateIndex < currentIndex; candidateIndex += 1) {
        const candidateEnd = ends[candidateIndex] ?? 0n;
        const candidateStart = starts[candidateIndex] ?? 0n;
        if (candidateEnd > currentStart) continue;
        finishedCount += 1;
        if (candidateEnd >= latestEnd) {
          latestEnd = candidateEnd;
          fallbackIndex = candidateIndex;
        }
        if (candidateStart > greatestStart) {
          secondGreatestStart = greatestStart;
          greatestStart = candidateStart;
          greatestStartIndex = candidateIndex;
        } else if (candidateStart > secondGreatestStart) {
          secondGreatestStart = candidateStart;
        }
      }

      if (finishedCount === 0) {
        if (parentId !== null && !pushEdge(parentId, current.spanId)) {
          return limitedGraph(included.length, edgeDrafts.length);
        }
        continue;
      }

      let emitted = false;
      for (let candidateIndex = 0; candidateIndex < currentIndex; candidateIndex += 1) {
        const candidate = ordered[candidateIndex];
        const candidateEnd = ends[candidateIndex] ?? 0n;
        if (!candidate || candidateEnd > currentStart) continue;
        const otherGreatestStart =
          candidateIndex === greatestStartIndex ? secondGreatestStart : greatestStart;
        if (candidateEnd <= otherGreatestStart) continue;
        if (!pushEdge(candidate.spanId, current.spanId)) {
          return limitedGraph(included.length, edgeDrafts.length);
        }
        if (parentId === null) rootSiblingSources.add(candidate.spanId);
        emitted = true;
      }

      if (!emitted && fallbackIndex >= 0) {
        const fallback = ordered[fallbackIndex];
        if (!fallback) continue;
        if (!pushEdge(fallback.spanId, current.spanId)) {
          return limitedGraph(included.length, edgeDrafts.length);
        }
        if (parentId === null) rootSiblingSources.add(fallback.spanId);
      }
    }
  }

  const incoming = new Set(edgeDrafts.map((edge) => edge.to));
  for (const source of included.filter((span) => !incoming.has(span.spanId))) {
    if (!pushEdge(TRACE_GRAPH_START_ID, source.spanId)) {
      return limitedGraph(included.length, edgeDrafts.length);
    }
  }
  for (const sink of (groups.get(null) ?? []).filter(
    (span) => !rootSiblingSources.has(span.spanId),
  )) {
    if (!pushEdge(sink.spanId, TRACE_GRAPH_END_ID)) {
      return limitedGraph(included.length, edgeDrafts.length);
    }
  }

  const edges = dedupeEdges(edgeDrafts);
  if (edges.length > MAX_TRACE_GRAPH_EDGES) {
    return limitedGraph(included.length, edges.length);
  }

  const spanToNodeId = new Map(included.map((span) => [span.spanId, span.spanId]));
  for (const span of allById.values()) {
    if (spanToNodeId.has(span.spanId)) continue;
    const ancestor = nearestIncludedParent(span, allById, includedIds);
    if (ancestor !== null) spanToNodeId.set(span.spanId, ancestor);
  }

  return {
    nodes: [
      systemNode(TRACE_GRAPH_START_ID, "Start"),
      ...included.map(spanNode),
      systemNode(TRACE_GRAPH_END_ID, "End"),
    ],
    edges,
    spanToNodeId,
  };
}

export function traceGraphNodeMatches(node: TraceGraphNode, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return [node.label, node.kind, node.spanId, node.serviceName, node.model]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLowerCase().includes(normalized));
}

function nearestIncludedParent(
  span: SpanDetail,
  allById: ReadonlyMap<string, SpanDetail>,
  includedIds: ReadonlySet<string>,
): string | null {
  const seen = new Set<string>([span.spanId]);
  let nearest: string | null = null;
  let parentId = span.parentSpanId;
  while (parentId !== null) {
    if (seen.has(parentId)) return null;
    if (nearest === null && includedIds.has(parentId)) nearest = parentId;
    seen.add(parentId);
    parentId = allById.get(parentId)?.parentSpanId ?? null;
  }
  return nearest;
}

function spanNode(span: SpanDetail): TraceGraphNode {
  return {
    id: span.spanId,
    spanId: span.spanId,
    label: span.name,
    kind: span.observationKind,
    status: span.status,
    durationMs: spanDurationMs(span),
    totalTokens: span.totalTokens,
    totalCost: span.totalCost,
    serviceName: span.serviceName,
    model: span.model,
  };
}

function systemNode(id: string, label: string): TraceGraphNode {
  return {
    id,
    label,
    kind: "system",
    status: "unset",
    durationMs: 0,
    totalTokens: 0,
    totalCost: null,
  };
}

function limitedGraph(nodeCount: number, edgeCount: number): ExpandedTraceGraph {
  return {
    nodes: [],
    edges: [],
    spanToNodeId: new Map(),
    limitExceeded: { nodeCount, edgeCount },
  };
}

function dedupeEdges(edges: EdgeDraft[]): TraceGraphEdge[] {
  const unique = new Map<string, TraceGraphEdge>();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const id = `${edge.from}->${edge.to}`;
    if (!unique.has(id)) unique.set(id, { id, ...edge });
  }
  return [...unique.values()];
}

function compareGraphSpans(left: SpanDetail, right: SpanDetail): number {
  const leftTimes = spanTimes(left);
  const rightTimes = spanTimes(right);
  if (leftTimes.start !== rightTimes.start) return leftTimes.start < rightTimes.start ? -1 : 1;
  if (leftTimes.end !== rightTimes.end) return leftTimes.end < rightTimes.end ? -1 : 1;
  return left.spanId.localeCompare(right.spanId);
}

function spanTimes(span: SpanDetail): { start: bigint; end: bigint } {
  const start = safeBigInt(span.startTimeUnixNano);
  const reportedEnd = safeBigInt(span.endTimeUnixNano);
  const duration = safeBigInt(span.durationNano);
  const end = reportedEnd > 0n ? reportedEnd : start + duration;
  return { start, end: end < start ? start : end };
}

function safeBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
