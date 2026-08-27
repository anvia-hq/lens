import { Alert, AlertDescription } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent } from "@lens/ui/components/card";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import {
  WarningCircle as AlertCircle,
  CaretRight as ChevronRight,
  Key as KeyRound,
} from "@phosphor-icons/react";
import { AnviaLensLogo } from "../../../components/anvia-lens-logo";
import { CenteredCard } from "../../../components/centered-card";
import { ModeToggle } from "../../../components/mode-toggle";
import type { AuthFormState } from "../hooks/use-auth-form";

export function AuthForm({ state }: { state: AuthFormState }) {
  const oidc = state.mode === "login" ? state.setup.data?.oidc : null;
  const passwordLoginEnabled =
    state.mode === "bootstrap" || state.setup.data?.passwordLoginEnabled !== false;
  const form = (
    <div className="grid gap-4">
      {oidc ? (
        <Button
          type="button"
          variant="outline"
          disabled={state.isOidcSubmitting || state.isSubmitting}
          onClick={() => void state.signInWithOidc()}
        >
          <KeyRound />
          Continue with {oidc.displayName}
        </Button>
      ) : null}
      {oidc && passwordLoginEnabled ? (
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <div className="h-px flex-1 bg-border" />
          <span>or use your password</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {passwordLoginEnabled ? (
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
          <Button type="submit" disabled={state.isSubmitting}>
            {state.mode === "login" ? "Sign in" : "Create owner account"}
            <ChevronRight />
          </Button>
        </form>
      ) : null}
      {!oidc && !passwordLoginEnabled ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>No sign-in method is configured.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );

  if (state.mode === "bootstrap") {
    return (
      <main className="relative flex min-h-svh items-center justify-center bg-background p-4">
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
          <AnviaLensLogo />
        </div>
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ModeToggle standalone />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="font-semibold text-xl tracking-tight">Workspace setup</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Create your owner profile to get started.
            </p>
          </div>
          <Card className="w-full py-8">
            <CardContent className="px-8">{form}</CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <CenteredCard
      branded
      eyebrow="Sign in"
      title="Welcome back"
      description="Sign in to your Anvia Lens workspace."
    >
      {form}
    </CenteredCard>
  );
}
