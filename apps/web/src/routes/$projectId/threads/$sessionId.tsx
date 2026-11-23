import { Danger as AlertCircle, ChatMessages as MessagesSquare } from "@mynaui/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageMessage } from "../../../components/full-page-message";
import { SessionConversation } from "../../../modules/observability/components/session-conversation";
import { useSessionDetail } from "../../../modules/observability/hooks/use-session-detail";

export const Route = createFileRoute("/$projectId/threads/$sessionId")({
  component: ThreadDetailPage,
});

function ThreadDetailPage() {
  const { deleteSession, deletionPending, detail, project, session } = useSessionDetail();
  if (session.isLoading)
    return <FullPageMessage icon={<MessagesSquare />} text="Loading thread" contained />;
  if (detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="Thread not found" contained />;
  return (
    <SessionConversation
      detail={detail}
      projectId={project.id}
      hasMore={session.hasNextPage}
      isLoadingMore={session.isFetchingNextPage}
      onLoadMore={() => void session.fetchNextPage()}
      onDelete={project.role === "owner" || project.role === "admin" ? deleteSession : undefined}
      deletionPending={deletionPending}
    />
  );
}
