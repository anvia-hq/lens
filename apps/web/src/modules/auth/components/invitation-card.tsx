import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { WarningCircle as AlertCircle, Check } from "@phosphor-icons/react";
import { CenteredCard } from "../../../components/centered-card";
import { ErrorAlert } from "../../../components/error-alert";
import type { InvitationState } from "../hooks/use-invitation";

export function InvitationCard({ state }: { state: InvitationState }) {
  const detail = state.detail;
  if (detail === undefined) return null;
  return (
    <CenteredCard
      branded
      eyebrow="Member invitation"
      title="Create your account"
      description={
        <>
          <strong>{detail.email}</strong> was invited as a {detail.role ?? "member"}.
        </>
      }
    >
      {!state.actionable ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Invitation unavailable</AlertTitle>
          <AlertDescription>
            This invitation is {state.expired ? "expired" : detail.status}.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.error ? <ErrorAlert error={state.error} /> : null}
      {state.actionable ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            state.submit();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invitation-name">Name</FieldLabel>
              <Input
                id="invitation-name"
                required
                autoFocus
                autoComplete="name"
                value={state.name}
                onChange={(event) => state.setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invitation-password">Password</FieldLabel>
              <Input
                id="invitation-password"
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={state.password}
                onChange={(event) => state.setPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invitation-password-confirmation">Confirm password</FieldLabel>
              <Input
                id="invitation-password-confirmation"
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={state.passwordConfirmation}
                onChange={(event) => state.setPasswordConfirmation(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {state.validationError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.validationError}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={state.claim.isPending}>
            <Check /> Create account and join
          </Button>
        </form>
      ) : null}
    </CenteredCard>
  );
}
