import type { TraceDetail } from "@lens/contracts";
import { useQueries } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import { useObservabilityProject } from "./use-observability-project";

export function useTraceCompare() {
  const { project } = useObservabilityProject();
  const { traceIds } = useSearch({ from: "/$projectId/traces/compare" });
  const traces = useQueries({
    queries: traceIds.map((traceId) => ({
      queryKey: ["trace", project.id, traceId],
      queryFn: () => api<TraceDetail>(`/api/v1/projects/${project.id}/traces/${traceId}`),
      refetchInterval: 5_000,
    })),
  });

  return { project, traceIds, traces };
}

export type TraceCompareState = ReturnType<typeof useTraceCompare>;
