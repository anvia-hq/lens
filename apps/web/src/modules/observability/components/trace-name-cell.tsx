import type { TraceSummary } from "@lens/contracts";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";
import { shortId } from "../utils/observability-view";

export function TraceNameCell({ trace }: { trace: TraceSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className="whitespace-nowrap font-mono text-xs font-medium hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
      title={trace.traceId}
    >
      {shortId(trace.traceId)}
    </Link>
  );
}
