import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type { InvitationDetail } from "../types";

export function useInvitation(invitationId: string) {
  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () => api<InvitationDetail>(`/api/v1/invitations/${invitationId}`),
  });
  const accept = useMutation({
    mutationFn: () =>
      api<unknown>("/api/auth/organization/accept-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: () => window.location.assign("/"),
  });
  const reject = useMutation({
    mutationFn: () =>
      api<unknown>("/api/auth/organization/reject-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId }),
      }),
    onSuccess: () => window.location.assign("/"),
  });
  const detail = invitation.data;
  const expired = detail === undefined ? false : Date.parse(detail.expiresAt) <= Date.now();
  const actionable = detail?.status === "pending" && !expired;

  return {
    accept,
    actionable,
    detail,
    error: accept.error ?? reject.error,
    expired,
    invitation,
    reject,
  };
}

export type InvitationState = ReturnType<typeof useInvitation>;
