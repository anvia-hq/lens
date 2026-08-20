import type { SpanDetail, TraceDetail } from "@lens/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { api } from "../../../lib/api";
import type { TraceSpanView } from "../types";
import { resolveSelectedSpan } from "../utils/trace-detail";
import { nextTracePollingState, type TracePollingState } from "../utils/trace-polling";
import { useDataDeletions } from "./use-data-deletions";
import { useObservabilityProject } from "./use-observability-project";

export function useTraceDetail() {
  const { project } = useObservabilityProject();
  const { traceId } = useParams({ from: "/$projectId/traces/$traceId" });
  const search = useSearch({ from: "/$projectId/traces/$traceId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const previousStatus = useRef<string | undefined>(undefined);
  const pollingState = useRef<TracePollingState | undefined>(undefined);
  const deletions = useDataDeletions(project.id, "trace");
  const trace = useQuery({
    queryKey: ["trace", project.id, traceId],
    queryFn: ({ signal }) =>
      api<TraceDetail>(`/api/v1/projects/${project.id}/traces/${traceId}`, { signal }),
    refetchInterval: (query) => {
      const summary = query.state.data?.summary;
      const result = nextTracePollingState(
        pollingState.current,
        summary
          ? {
              dataUpdatedAt: query.state.dataUpdatedAt,
              lastSeenAt: summary.lastSeenAt,
              spanCount: summary.spanCount,
              status: summary.status,
              traceKey: `${project.id}:${traceId}`,
            }
          : undefined,
      );
      pollingState.current = result.state;
      return result.interval;
    },
    staleTime: (query) => (query.state.data?.summary.status === "running" ? 0 : 5 * 60 * 1_000),
  });
  const detail = trace.data;
  const selectedSummary = detail ? resolveSelectedSpan(detail.spans, search.span) : undefined;
  const selectedSpan = useQuery({
    queryKey: ["trace-span", project.id, traceId, selectedSummary?.spanId],
    queryFn: ({ signal }) =>
      api<SpanDetail>(
        `/api/v1/projects/${project.id}/traces/${traceId}/spans/${selectedSummary?.spanId}`,
        { signal },
      ),
    enabled: selectedSummary !== undefined,
    staleTime: 5 * 60 * 1_000,
  });
  const selectedSpanExists =
    search.span === undefined || detail?.spans.some((span) => span.spanId === search.span) === true;
  useEffect(() => {
    if (detail === undefined || selectedSpanExists) return;
    void navigate({
      to: "/$projectId/traces/$traceId",
      params: { projectId: project.id, traceId },
      search: { ...search, span: undefined },
      replace: true,
    });
  }, [detail, navigate, project.id, search, selectedSpanExists, traceId]);
  useEffect(() => {
    const status = detail?.summary.status;
    if (previousStatus.current === "running" && status !== undefined && status !== "running") {
      void queryClient.invalidateQueries({
        queryKey: ["trace-span", project.id, traceId],
      });
    }
    previousStatus.current = status;
  }, [detail?.summary.status, project.id, queryClient, traceId]);

  const selectSpan = (span: string) => {
    void navigate({
      to: "/$projectId/traces/$traceId",
      params: { projectId: project.id, traceId },
      search: { ...search, span },
    });
  };
  const changeView = (view: TraceSpanView) => {
    void navigate({
      to: "/$projectId/traces/$traceId",
      params: { projectId: project.id, traceId },
      search: { ...search, view: view === "tree" ? undefined : view },
    });
  };

  const deleteTrace = () =>
    deletions.create.mutate([traceId], {
      onSuccess: () =>
        void navigate({
          to: "/$projectId/traces",
          params: { projectId: project.id },
          search: { range: "24h" },
        }),
    });

  return {
    changeView,
    deleteTrace,
    deletionPending: deletions.create.isPending,
    detail,
    project,
    search,
    selectedSpan,
    selectedSpanId: selectedSummary?.spanId,
    selectSpan,
    trace,
  };
}
