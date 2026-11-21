import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRACE_GRAPH_LAYOUT_TIMEOUT_MS } from "./trace-graph-layout";
import {
  requestTraceGraphLayout,
  terminateTraceGraphLayoutWorker,
  TraceGraphLayoutCancelledError,
} from "./trace-graph-layout-client";

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly posted: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  terminateTraceGraphLayoutWorker();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("trace graph layout worker pool", () => {
  it("reuses a single worker across sequential layout requests", async () => {
    const first = requestTraceGraphLayout([]);
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0]!;
    const firstPayload = worker.posted[0] as { requestId: number };
    worker.emit("message", {
      data: {
        requestId: firstPayload.requestId,
        graph: { nodes: [], edges: [], spanToNodeEntries: [], limitExceeded: false },
      },
    });
    await expect(first).resolves.toMatchObject({ graph: { nodes: [], limitExceeded: false } });
    expect(worker.terminated).toBe(false);

    const second = requestTraceGraphLayout([]);
    expect(FakeWorker.instances).toHaveLength(1);
    const secondPayload = worker.posted[1] as { requestId: number };
    worker.emit("message", {
      data: {
        requestId: secondPayload.requestId,
        graph: { nodes: [], edges: [], spanToNodeEntries: [], limitExceeded: false },
      },
    });
    await expect(second).resolves.toMatchObject({ graph: { nodes: [], limitExceeded: false } });
  });

  it("cancels an aborted request without terminating the shared worker", async () => {
    const controller = new AbortController();
    const request = requestTraceGraphLayout([], controller.signal);
    const worker = FakeWorker.instances[0]!;
    controller.abort();
    await expect(request).rejects.toBeInstanceOf(TraceGraphLayoutCancelledError);
    expect(worker.terminated).toBe(false);
  });

  it("terminates and replaces the worker after a timeout", async () => {
    vi.useFakeTimers();
    const timedOut = requestTraceGraphLayout([]);
    const worker = FakeWorker.instances[0]!;
    const assertion = expect(timedOut).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(TRACE_GRAPH_LAYOUT_TIMEOUT_MS);
    await assertion;
    expect(worker.terminated).toBe(true);

    const recovery = requestTraceGraphLayout([]);
    expect(FakeWorker.instances).toHaveLength(2);
    const nextWorker = FakeWorker.instances[1]!;
    const payload = nextWorker.posted[0] as { requestId: number };
    nextWorker.emit("message", {
      data: {
        requestId: payload.requestId,
        graph: { nodes: [], edges: [], spanToNodeEntries: [], limitExceeded: false },
      },
    });
    await expect(recovery).resolves.toMatchObject({ graph: { nodes: [] } });
  });
});
