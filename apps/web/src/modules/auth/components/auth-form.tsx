import { Alert, AlertDescription } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import {
  DangerCircle as AlertCircle,
  CheckCircle as Check,
  AltArrowRight as ChevronRight,
  RecordCircle as CircleDot,
} from "@solar-icons/react";
import { CenteredCard } from "../../../components/centered-card";
import type { AuthFormState } from "../hooks/use-auth-form";

export function AuthForm({ state }: { state: AuthFormState }) {
  return (
    <CenteredCard
      icon={<CircleDot />}
      eyebrow="Welcome to Anvia Lens"
      title={state.mode === "login" ? "Sign in to continue" : "Create your account"}
      description="OpenTelemetry-native observability for AI systems."
    >
      <form className="grid gap-4" onSubmit={state.submit}>
        {state.mode === "signup" ? (
          <Field>
            <FieldLabel htmlFor="auth-name">Name</FieldLabel>
            <Input
              id="auth-name"
              required
              value={state.name}
              onChange={(event) => state.setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="auth-email">Email</FieldLabel>
          <Input
            id="auth-email"
            required
            type="email"
            value={state.email}
            onChange={(event) => state.setEmail(event.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="auth-password">Password</FieldLabel>
          <Input
            id="auth-password"
            required
            minLength={8}
            type="password"
            value={state.password}
            onChange={(event) => state.setPassword(event.target.value)}
            autoComplete={state.mode === "signup" ? "new-password" : "current-password"}
          />
        </Field>
        {state.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.notice ? (
          <Alert>
            <Check />
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit">
          {state.mode === "login" ? "Sign in" : "Create account"}
          <ChevronRight />
        </Button>
      </form>
      <Button variant="link" onClick={state.toggleMode}>
        {state.mode === "login"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </Button>
    </CenteredCard>
  );
}
