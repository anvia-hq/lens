import { WarningCircle as AlertCircle, Chats as MessagesSquare } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageMessage } from "../../../components/full-page-message";
import { SessionConversation } from "../../../modules/observability/components/session-conversation";
import { useSessionDetail } from "../../../modules/observability/hooks/use-session-detail";

export const Route = createFileRoute("/$projectId/sessions/$sessionId")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { detail, project, session } = useSessionDetail();
  if (session.isLoading)
    return <FullPageMessage icon={<MessagesSquare />} text="Loading session" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Session not found" contained />;
  return <SessionConversation detail={detail} projectId={project.id} />;
}
