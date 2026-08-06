import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import {
  DangerCircle as AlertCircle,
  CheckCircle as Check,
  UserPlus as MailPlus,
} from "@solar-icons/react";
import { CenteredCard } from "../../../components/centered-card";
import { ErrorAlert } from "../../../components/error-alert";
import type { InvitationState } from "../hooks/use-invitation";

export function InvitationCard({ state }: { state: InvitationState }) {
  const detail = state.detail;
  if (detail === undefined) return null;
  return (
    <CenteredCard
      icon={<MailPlus />}
      eyebrow="Team invitation"
      title={`Join ${detail.organizationName}`}
      description={
        <>
          You were invited as <strong>{detail.role ?? "member"}</strong>. Accept to access this
          team&apos;s projects.
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
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!state.actionable || state.accept.isPending}
          onClick={() => state.accept.mutate()}
        >
          <Check /> Accept
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          disabled={!state.actionable || state.reject.isPending}
          onClick={() => state.reject.mutate()}
        >
          Decline
        </Button>
      </div>
    </CenteredCard>
  );
}
