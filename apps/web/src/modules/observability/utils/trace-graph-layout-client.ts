import type { TraceSpanSummary } from "@lens/contracts";
import type { ExpandedTraceGraph } from "./trace-graph";
import { TRACE_GRAPH_LAYOUT_TIMEOUT_MS, type TraceGraphLayout } from "./trace-graph-layout";

export class TraceGraphLayoutCancelledError extends Error {
  constructor() {
    super("Trace graph layout cancelled");
    this.name = "TraceGraphLayoutCancelledError";
  }
}

type WorkerResult = {
  error?: string;
  graph?: Omit<ExpandedTraceGraph, "spanToNodeId"> & {
    spanToNodeEntries: Array<[string, string]>;
  };
  layout?: TraceGraphLayout;
};

export type TraceGraphWorkerResult = {
  graph: ExpandedTraceGraph;
  layout?: TraceGraphLayout;
};

export async function requestTraceGraphLayout(
  spans: TraceSpanSummary[],
  signal?: AbortSignal,
): Promise<TraceGraphWorkerResult> {
  if (signal?.aborted) throw new TraceGraphLayoutCancelledError();
  const worker = new Worker(
    new URL("../../../workers/trace-graph-layout.worker.ts", import.meta.url),
    { type: "module", name: "trace-graph-layout" },
  );
  return new Promise<TraceGraphWorkerResult>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      callback();
    };
    const cancel = () => finish(() => reject(new TraceGraphLayoutCancelledError()));
    const timeout = setTimeout(
      () => finish(() => reject(new Error("Trace graph layout timed out"))),
      TRACE_GRAPH_LAYOUT_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.addEventListener("error", () =>
      finish(() => reject(new Error("Trace graph layout worker failed"))),
    );
    worker.addEventListener("message", (event: MessageEvent<WorkerResult>) =>
      finish(() => {
        if (event.data.error || !event.data.graph) {
          reject(new Error(event.data.error ?? "Trace graph worker returned no graph"));
          return;
        }
        resolve({
          graph: {
            nodes: event.data.graph.nodes,
            edges: event.data.graph.edges,
            spanToNodeId: new Map(event.data.graph.spanToNodeEntries),
            limitExceeded: event.data.graph.limitExceeded,
          },
          layout: event.data.layout,
        });
      }),
    );
    worker.postMessage({ spans });
  });
}
