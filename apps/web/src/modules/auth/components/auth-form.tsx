import { Alert, AlertDescription } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { WarningCircle as AlertCircle, CaretRight as ChevronRight } from "@phosphor-icons/react";
import { CenteredCard } from "../../../components/centered-card";
import type { AuthFormState } from "../hooks/use-auth-form";

export function AuthForm({ state }: { state: AuthFormState }) {
  return (
    <CenteredCard
      branded
      eyebrow={state.mode === "login" ? "Sign in" : "First-time setup"}
      title={state.mode === "login" ? "Welcome back" : "Set up Anvia Lens"}
      description={
        state.mode === "login"
          ? "Sign in to your Anvia Lens workspace."
          : "Create the owner account for this installation."
      }
    >
      <form className="grid gap-4" onSubmit={state.submit}>
        {state.mode === "bootstrap" ? (
          <Field>
            <FieldLabel htmlFor="auth-name">Name</FieldLabel>
            <Input
              id="auth-name"
              required
              value={state.name}
              onChange={(event) => state.setName(event.target.value)}
              autoComplete="name"
              autoFocus
              placeholder="Your name"
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
            autoFocus={state.mode === "login"}
            placeholder="you@example.com"
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
            autoComplete={state.mode === "bootstrap" ? "new-password" : "current-password"}
          />
        </Field>
        {state.mode === "bootstrap" ? (
          <Field>
            <FieldLabel htmlFor="auth-password-confirmation">Confirm password</FieldLabel>
            <Input
              id="auth-password-confirmation"
              required
              minLength={8}
              type="password"
              value={state.passwordConfirmation}
              onChange={(event) => state.setPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        ) : null}
        {state.error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={state.isSubmitting}>
          {state.mode === "login" ? "Sign in" : "Create owner account"}
          <ChevronRight />
        </Button>
      </form>
    </CenteredCard>
  );
}
