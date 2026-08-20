import type { TraceSpanSummary } from "@lens/contracts";
import ELK from "elkjs/lib/elk.bundled";
import { buildExpandedTraceGraph } from "../modules/observability/utils/trace-graph";
import {
  normalizeTraceGraphLayout,
  traceGraphElkInput,
} from "../modules/observability/utils/trace-graph-layout";

const elk = new ELK();

self.addEventListener("message", (event: MessageEvent<{ spans: TraceSpanSummary[] }>) => {
  const graph = buildExpandedTraceGraph(event.data.spans);
  if (graph.limitExceeded || graph.nodes.length === 0) {
    self.postMessage({ graph: serializableGraph(graph) });
    return;
  }
  void elk.layout(traceGraphElkInput(graph)).then(
    (result) => {
      self.postMessage({
        graph: serializableGraph(graph),
        layout: normalizeTraceGraphLayout(result),
      });
    },
    (error: unknown) => {
      self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    },
  );
});

function serializableGraph(graph: ReturnType<typeof buildExpandedTraceGraph>) {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    spanToNodeEntries: [...graph.spanToNodeId.entries()],
    limitExceeded: graph.limitExceeded,
  };
}
