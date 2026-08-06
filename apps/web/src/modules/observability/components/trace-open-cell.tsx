import type { TraceSummary } from "@lens/contracts";
import { buttonVariants } from "@lens/ui/components/button";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";

export function TraceOpenCell({ trace }: { trace: TraceSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      to="/$projectId/traces/$traceId"
      params={{ projectId: project.id, traceId: trace.traceId }}
      aria-label={`Open ${trace.name}`}
    >
      <ChevronRight />
    </Link>
  );
}
