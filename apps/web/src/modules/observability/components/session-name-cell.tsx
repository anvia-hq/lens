import type { SessionSummary } from "@lens/contracts";
import { Chats as MessagesSquare } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useObservabilityProject } from "../hooks/use-observability-project";

export function SessionNameCell({ session }: { session: SessionSummary }) {
  const { project } = useObservabilityProject();
  return (
    <Link
      className="flex items-center gap-3 font-medium hover:underline"
      to="/$projectId/sessions/$sessionId"
      params={{ projectId: project.id, sessionId: session.sessionId }}
    >
      <MessagesSquare className="size-4 text-muted-foreground" />
      <span className="font-mono">{session.sessionId}</span>
    </Link>
  );
}
