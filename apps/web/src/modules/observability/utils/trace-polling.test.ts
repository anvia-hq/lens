import { describe, expect, it } from "vitest";
import {
  nextTracePollingState,
  TRACE_POLL_INTERVAL_MS,
  type TracePollingState,
} from "./trace-polling";

function terminalSnapshot(dataUpdatedAt: number, spanCount = 2) {
  return {
    dataUpdatedAt,
    lastSeenAt: `2026-08-20T00:00:0${spanCount}.000Z`,
    spanCount,
    status: "ok" as const,
    traceKey: "project-1:trace-1",
  };
}

describe("nextTracePollingState", () => {
  it("keeps polling a running trace", () => {
    const result = nextTracePollingState(undefined, {
      ...terminalSnapshot(1),
      status: "running",
    });

    expect(result).toEqual({ interval: TRACE_POLL_INTERVAL_MS, state: undefined });
  });

  it("stops only after two stable terminal refreshes", () => {
    let state: TracePollingState | undefined;

    const first = nextTracePollingState(state, terminalSnapshot(1));
    state = first.state;
    const second = nextTracePollingState(state, terminalSnapshot(2));
    state = second.state;
    const third = nextTracePollingState(state, terminalSnapshot(3));

    expect(first.interval).toBe(TRACE_POLL_INTERVAL_MS);
    expect(second.interval).toBe(TRACE_POLL_INTERVAL_MS);
    expect(third.interval).toBe(false);
  });

  it("restarts stabilization when late spans arrive", () => {
    let result = nextTracePollingState(undefined, terminalSnapshot(1));
    result = nextTracePollingState(result.state, terminalSnapshot(2, 3));
    expect(result.state?.stablePolls).toBe(0);
    expect(result.interval).toBe(TRACE_POLL_INTERVAL_MS);

    result = nextTracePollingState(result.state, terminalSnapshot(3, 3));
    result = nextTracePollingState(result.state, terminalSnapshot(4, 3));
    expect(result.interval).toBe(false);
  });
});
