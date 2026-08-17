import ELK from "elkjs/lib/elk-api";
import type { ExpandedTraceGraph } from "./trace-graph";
import {
  type ElkGraphResult,
  normalizeTraceGraphLayout,
  TRACE_GRAPH_LAYOUT_TIMEOUT_MS,
  type TraceGraphLayout,
  traceGraphElkInput,
} from "./trace-graph-layout";

export class TraceGraphLayoutCancelledError extends Error {
  constructor() {
    super("Trace graph layout cancelled");
    this.name = "TraceGraphLayoutCancelledError";
  }
}

export async function requestTraceGraphLayout(
  graph: ExpandedTraceGraph,
  signal?: AbortSignal,
): Promise<TraceGraphLayout> {
  if (signal?.aborted) throw new TraceGraphLayoutCancelledError();

  const worker = new Worker(
    new URL("../../../workers/trace-graph-layout.worker.ts", import.meta.url),
    { type: "module", name: "trace-graph-layout" },
  );
  const elk = new ELK({ workerFactory: () => worker });

  return new Promise<TraceGraphLayout>((resolve, reject) => {
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
      finish(() => reject(new Error("Trace graph layout worker failed to load"))),
    );

    elk.layout(traceGraphElkInput(graph)).then(
      (result) => finish(() => resolve(normalizeTraceGraphLayout(result as ElkGraphResult))),
      (error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
    );
  });
}
