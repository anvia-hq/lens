import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import { DangerCircle as AlertCircle } from "@solar-icons/react";

export function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : "Request failed"}
      </AlertDescription>
    </Alert>
  );
}
