import type { TraceSummary } from "@lens/contracts";

export const TRACE_POLL_INTERVAL_MS = 5_000;
const TERMINAL_STABLE_POLLS = 2;

type TracePollingSnapshot = Pick<TraceSummary, "lastSeenAt" | "spanCount" | "status"> & {
  dataUpdatedAt: number;
  traceKey: string;
};

export type TracePollingState = {
  dataUpdatedAt: number;
  fingerprint: string;
  stablePolls: number;
  traceKey: string;
};

export function nextTracePollingState(
  current: TracePollingState | undefined,
  snapshot: TracePollingSnapshot | undefined,
): { interval: number | false; state: TracePollingState | undefined } {
  if (snapshot === undefined) return { interval: false, state: current };
  if (snapshot.status === "running") {
    return { interval: TRACE_POLL_INTERVAL_MS, state: undefined };
  }

  const fingerprint = `${snapshot.spanCount}:${snapshot.lastSeenAt}`;
  if (current === undefined || current.traceKey !== snapshot.traceKey) {
    return {
      interval: TRACE_POLL_INTERVAL_MS,
      state: {
        dataUpdatedAt: snapshot.dataUpdatedAt,
        fingerprint,
        stablePolls: 0,
        traceKey: snapshot.traceKey,
      },
    };
  }

  if (current.dataUpdatedAt === snapshot.dataUpdatedAt) {
    return {
      interval: current.stablePolls >= TERMINAL_STABLE_POLLS ? false : TRACE_POLL_INTERVAL_MS,
      state: current,
    };
  }

  const stablePolls = current.fingerprint === fingerprint ? current.stablePolls + 1 : 0;
  return {
    interval: stablePolls >= TERMINAL_STABLE_POLLS ? false : TRACE_POLL_INTERVAL_MS,
    state: {
      dataUpdatedAt: snapshot.dataUpdatedAt,
      fingerprint,
      stablePolls,
      traceKey: snapshot.traceKey,
    },
  };
}
