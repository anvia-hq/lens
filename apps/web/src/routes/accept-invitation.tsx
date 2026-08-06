import { DangerCircle as AlertCircle, UserPlus as MailPlus } from "@solar-icons/react";
import { useParams } from "@tanstack/react-router";
import { FullPageMessage } from "../components/full-page-message";
import { InvitationCard } from "../modules/auth/components/invitation-card";
import { useInvitation } from "../modules/auth/hooks/use-invitation";

export function AcceptInvitationPage() {
  const { invitationId } = useParams({ from: "/accept-invitation/$invitationId" });
  const invitation = useInvitation(invitationId);
  if (invitation.invitation.isLoading)
    return <FullPageMessage icon={<MailPlus />} text="Loading invitation" />;
  if (invitation.invitation.isError || invitation.detail === undefined)
    return <FullPageMessage icon={<AlertCircle />} text="This invitation is unavailable" />;
  return <InvitationCard state={invitation} />;
}
