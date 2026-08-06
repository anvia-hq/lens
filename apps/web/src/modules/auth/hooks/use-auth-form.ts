import { type FormEvent, useState } from "react";
import { authClient } from "../../../lib/auth";
import type { AuthMode } from "../types";

export function useAuthForm() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            name,
            email,
            password,
            callbackURL: window.location.href,
          })
        : await authClient.signIn.email({ email, password });
    if (result.error) setError(result.error.message ?? "Authentication failed");
    else if (mode === "signup") {
      setNotice("Account created. Check your email to verify it, then sign in here.");
      setMode("login");
    }
  };

  const toggleMode = () => setMode(mode === "login" ? "signup" : "login");

  return {
    email,
    error,
    mode,
    name,
    notice,
    password,
    setEmail,
    setName,
    setPassword,
    submit,
    toggleMode,
  };
}

export type AuthFormState = ReturnType<typeof useAuthForm>;
