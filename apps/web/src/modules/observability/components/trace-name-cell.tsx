import type { TraceSummary } from "@lens/contracts";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";
import { shortId } from "../utils/observability-view";
import { ObservationIcon } from "./observation-icon";

export function TraceNameCell({ trace }: { trace: TraceSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className="flex items-center gap-3 font-medium hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
    >
      <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
      <span className="grid">
        <span>{trace.name}</span>
        <span className="font-mono text-xs font-normal text-muted-foreground">
          {shortId(trace.traceId)} · {trace.spanCount} spans
        </span>
      </span>
    </Link>
  );
}
