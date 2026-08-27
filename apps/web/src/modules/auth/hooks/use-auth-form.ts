import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";
import { oidcErrorFromSearch } from "../oidc-error";
import type { AuthMode, SetupStatus } from "../types";

function initialAuthError(): string {
  return oidcErrorFromSearch(window.location.search)?.message ?? "";
}

export function useAuthForm() {
  const setup = useQuery({
    queryKey: ["setup"],
    queryFn: () => api<SetupStatus>("/api/public/setup"),
  });
  const mode: AuthMode = setup.data?.initialized === false ? "bootstrap" : "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState(initialAuthError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOidcSubmitting, setIsOidcSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "bootstrap" && password !== passwordConfirmation) {
      setError("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === "bootstrap") {
        await api("/api/auth/bootstrap", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        window.location.assign("/");
        return;
      }
      const result = await authClient.signIn.email({ email, password });
      if (result.error) setError(result.error.message ?? "Authentication failed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithOidc = async () => {
    const oidc = setup.data?.oidc;
    if (oidc === null || oidc === undefined) return;
    setError("");
    setIsOidcSubmitting(true);
    try {
      const result = await authClient.signIn.oauth2({
        providerId: oidc.providerId,
        callbackURL: "/",
        errorCallbackURL: "/",
      });
      if (result.error) setError(result.error.message ?? "OIDC authentication failed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OIDC authentication failed");
    } finally {
      setIsOidcSubmitting(false);
    }
  };

  return {
    email,
    error,
    isOidcSubmitting,
    isSubmitting,
    mode,
    name,
    password,
    passwordConfirmation,
    setEmail,
    setName,
    setPassword,
    setPasswordConfirmation,
    signInWithOidc,
    setup,
    submit,
  };
}

export type AuthFormState = ReturnType<typeof useAuthForm>;
