import { DangerCircle as AlertCircle, Dialog2 as MessagesSquare } from "@solar-icons/react";
import { FullPageMessage } from "../components/full-page-message";
import { SessionConversation } from "../modules/observability/components/session-conversation";
import { useSessionDetail } from "../modules/observability/hooks/use-session-detail";

export function SessionDetailPage() {
  const { detail, project, session } = useSessionDetail();
  if (session.isLoading)
    return <FullPageMessage icon={<MessagesSquare />} text="Loading session" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Session not found" contained />;
  return <SessionConversation detail={detail} projectId={project.id} />;
}
