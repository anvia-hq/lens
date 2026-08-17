import type { TraceDetail } from "@lens/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "../../../lib/api";
import type { TraceSpanView } from "../types";
import { useObservabilityProject } from "./use-observability-project";

export function useTraceDetail() {
  const { project } = useObservabilityProject();
  const { traceId } = useParams({ from: "/$projectId/traces/$traceId" });
  const search = useSearch({ from: "/$projectId/traces/$traceId" });
  const navigate = useNavigate();
  const trace = useQuery({
    queryKey: ["trace", project.id, traceId],
    queryFn: () => api<TraceDetail>(`/api/v1/projects/${project.id}/traces/${traceId}`),
    refetchInterval: 5_000,
  });
  const detail = trace.data;
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

  return { changeView, detail, project, search, selectSpan, trace };
}
