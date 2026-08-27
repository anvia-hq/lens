import { WarningCircle as AlertCircle, UserPlus as MailPlus } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { FullPageMessage } from "../../components/full-page-message";
import { InvitationCard } from "../../modules/auth/components/invitation-card";
import { useInvitation } from "../../modules/auth/hooks/use-invitation";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { invitationId } = Route.useParams();
  const invitation = useInvitation(invitationId);
  if (invitation.invitation.isLoading || invitation.setup.isLoading)
    return <FullPageMessage icon={<MailPlus />} text="Loading invitation" />;
  if (invitation.invitation.isError || invitation.setup.isError || invitation.detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="This invitation is unavailable" />;
  return <InvitationCard state={invitation} />;
}
