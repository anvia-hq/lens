import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import { WarningCircle as AlertCircle } from "@phosphor-icons/react";

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
