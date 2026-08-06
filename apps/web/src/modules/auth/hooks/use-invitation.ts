import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../lib/api";
import type { InvitationDetail } from "../types";

export function useInvitation(invitationId: string) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [validationError, setValidationError] = useState("");
  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () => api<InvitationDetail>(`/api/public/invitations/${invitationId}`),
  });
  const claim = useMutation({
    mutationFn: () =>
      api<unknown>("/api/auth/claim-invitation", {
        method: "POST",
        body: JSON.stringify({ invitationId, name, password }),
      }),
    onSuccess: () => window.location.assign("/"),
  });
  const submit = () => {
    setValidationError("");
    if (password !== passwordConfirmation) {
      setValidationError("Passwords do not match");
      return;
    }
    claim.mutate();
  };
  const detail = invitation.data;
  const expired = detail === undefined ? false : Date.parse(detail.expiresAt) <= Date.now();
  const actionable = detail?.status === "pending" && !expired;

  return {
    actionable,
    claim,
    detail,
    error: claim.error,
    expired,
    invitation,
    name,
    password,
    passwordConfirmation,
    setName,
    setPassword,
    setPasswordConfirmation,
    submit,
    validationError,
  };
}

export type InvitationState = ReturnType<typeof useInvitation>;
