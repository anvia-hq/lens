import type { SessionSummary } from "@lens/contracts";
import { buttonVariants } from "@lens/ui/components/button";
import { AltArrowRight as ChevronRight } from "@solar-icons/react";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";

export function SessionOpenCell({ session }: { session: SessionSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
      to="/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.sessionId }}
      aria-label={`Open session ${session.sessionId}`}
    >
      <ChevronRight />
    </Link>
  );
}
