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
  requestId?: number;
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

type PendingRequest = {
  resolve: (result: TraceGraphWorkerResult) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function resetSharedWorker(error?: Error) {
  const worker = sharedWorker;
  sharedWorker = null;
  worker?.terminate();
  if (error !== undefined) {
    const entries = [...pendingRequests.values()];
    pendingRequests.clear();
    for (const pending of entries) {
      pending.cleanup();
      pending.reject(error);
    }
  }
}

function getSharedWorker(): Worker {
  if (sharedWorker !== null) return sharedWorker;
  const worker = new Worker(
    new URL("../../../workers/trace-graph-layout.worker.ts", import.meta.url),
    { type: "module", name: "trace-graph-layout" },
  );
  worker.addEventListener("error", () => {
    if (sharedWorker === worker) {
      resetSharedWorker(new Error("Trace graph layout worker failed"));
    }
  });
  worker.addEventListener("message", (event: MessageEvent<WorkerResult>) => {
    const requestId = event.data.requestId;
    if (requestId === undefined) return;
    const pending = pendingRequests.get(requestId);
    if (pending === undefined) return;
    pendingRequests.delete(requestId);
    pending.cleanup();
    if (event.data.error || !event.data.graph) {
      pending.reject(new Error(event.data.error ?? "Trace graph worker returned no graph"));
      return;
    }
    pending.resolve({
      graph: {
        nodes: event.data.graph.nodes,
        edges: event.data.graph.edges,
        spanToNodeId: new Map(event.data.graph.spanToNodeEntries),
        limitExceeded: event.data.graph.limitExceeded,
      },
      layout: event.data.layout,
    });
  });
  sharedWorker = worker;
  return worker;
}

export function terminateTraceGraphLayoutWorker(): void {
  resetSharedWorker(new TraceGraphLayoutCancelledError());
}

export async function requestTraceGraphLayout(
  spans: TraceSpanSummary[],
  signal?: AbortSignal,
): Promise<TraceGraphWorkerResult> {
  if (signal?.aborted) throw new TraceGraphLayoutCancelledError();
  const worker = getSharedWorker();
  const requestId = nextRequestId++;
  return new Promise<TraceGraphWorkerResult>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      if (!pendingRequests.delete(requestId)) return;
      cleanup();
      reject(new TraceGraphLayoutCancelledError());
    };
    const timeout = setTimeout(() => {
      if (!pendingRequests.delete(requestId)) return;
      cleanup();
      // Terminate a timed-out worker so a wedged layout cannot stall subsequent requests.
      resetSharedWorker(new Error("Trace graph layout timed out"));
      reject(new Error("Trace graph layout timed out"));
    }, TRACE_GRAPH_LAYOUT_TIMEOUT_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    pendingRequests.set(requestId, { resolve, reject, cleanup });
    worker.postMessage({ requestId, spans });
  });
}
