import type { TraceSummary } from "@lens/contracts";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";

export function TraceNameCell({ trace }: { trace: TraceSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className="whitespace-nowrap font-mono text-xs font-medium text-primary hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
    >
      {trace.traceId}
    </Link>
  );
}
