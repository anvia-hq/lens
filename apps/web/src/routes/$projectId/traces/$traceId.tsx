import { Pulse as Activity, WarningCircle as AlertCircle } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageMessage } from "../../../components/full-page-message";
import { TraceDetailExplorer } from "../../../modules/observability/components/trace-detail-explorer";
import { useTraceDetail } from "../../../modules/observability/hooks/use-trace-detail";
import type { TraceDetailSearch } from "../../../modules/observability/types";
import { validateTraceDetailSearch as normalizeTraceDetailSearch } from "../../../modules/observability/utils";

export function validateTraceDetailSearch(search: Record<string, unknown>): TraceDetailSearch {
  return normalizeTraceDetailSearch(search);
}

export const Route = createFileRoute("/$projectId/traces/$traceId")({
  validateSearch: validateTraceDetailSearch,
  component: TraceDetailPage,
});

function TraceDetailPage() {
  const { changeView, deleteTrace, deletionPending, detail, project, search, selectSpan, trace } =
    useTraceDetail();
  if (trace.isLoading)
    return <FullPageMessage icon={<Activity />} text="Loading trace" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Trace not found" contained />;
  return (
    <TraceDetailExplorer
      key={detail.summary.traceId}
      detail={detail}
      canManage={project.role === "owner" || project.role === "admin"}
      projectId={project.id}
      selectedSpanId={search.span}
      view={search.view ?? "tree"}
      onSelectSpan={selectSpan}
      onViewChange={changeView}
      onDelete={project.role === "owner" || project.role === "admin" ? deleteTrace : undefined}
      deletionPending={deletionPending}
    />
  );
}
