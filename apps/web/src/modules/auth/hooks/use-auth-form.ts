import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";
import type { AuthMode, SetupStatus } from "../types";

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
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return {
    email,
    error,
    isSubmitting,
    mode,
    name,
    password,
    passwordConfirmation,
    setEmail,
    setName,
    setPassword,
    setPasswordConfirmation,
    setup,
    submit,
  };
}

export type AuthFormState = ReturnType<typeof useAuthForm>;
