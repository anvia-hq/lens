import type { SessionSummary } from "@lens/contracts";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";

export function SessionNameCell({ session }: { session: SessionSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className="font-mono font-medium hover:underline"
      to="/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.sessionId }}
    >
      {session.sessionId}
    </Link>
  );
}
