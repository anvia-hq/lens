import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";
import { oidcErrorFromSearch } from "../oidc-error";
import type { InvitationDetail, SetupStatus } from "../types";

export function useInvitation(invitationId: string) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [validationError, setValidationError] = useState("");
  const [oidcError, setOidcError] = useState<Error | undefined>(() =>
    oidcErrorFromSearch(window.location.search),
  );
  const [isOidcSubmitting, setIsOidcSubmitting] = useState(false);
  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () => api<InvitationDetail>(`/api/public/invitations/${invitationId}`),
  });
  const setup = useQuery({
    queryKey: ["setup"],
    queryFn: () => api<SetupStatus>("/api/public/setup"),
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
  const signInWithOidc = async () => {
    const oidc = setup.data?.oidc;
    if (oidc === null || oidc === undefined) return;
    setOidcError(undefined);
    setIsOidcSubmitting(true);
    try {
      const result = await authClient.signIn.oauth2({
        providerId: oidc.providerId,
        callbackURL: "/",
        errorCallbackURL: window.location.pathname,
      });
      if (result.error) {
        setOidcError(new Error(result.error.message ?? "OIDC authentication failed"));
      }
    } catch (cause) {
      setOidcError(cause instanceof Error ? cause : new Error("OIDC authentication failed"));
    } finally {
      setIsOidcSubmitting(false);
    }
  };
  const detail = invitation.data;
  const expired = detail === undefined ? false : Date.parse(detail.expiresAt) <= Date.now();
  const actionable = detail?.status === "pending" && !expired;

  return {
    actionable,
    claim,
    detail,
    error: claim.error ?? setup.error ?? oidcError,
    expired,
    invitation,
    isOidcSubmitting,
    name,
    password,
    passwordConfirmation,
    setName,
    setPassword,
    setPasswordConfirmation,
    setup,
    signInWithOidc,
    submit,
    validationError,
  };
}

export type InvitationState = ReturnType<typeof useInvitation>;
