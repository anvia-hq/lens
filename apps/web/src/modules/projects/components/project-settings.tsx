import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lens/ui/components/alert-dialog";
import { Button, buttonVariants } from "@lens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Spinner } from "@lens/ui/components/spinner";
import { ArrowRight, Check, Plus, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { ProjectSettingsState } from "../hooks/use-project-settings";
import { SecretReveal } from "./secret-reveal";

export function ProjectSettings({ state }: { state: ProjectSettingsState }) {
  const {
    createKey,
    keyName,
    keys,
    newKey,
    project,
    retention,
    revokeKey,
    saveSettings,
    setKeyName,
    setNewKey,
    setRetention,
  } = state;
  const [keyToRevoke, setKeyToRevoke] = useState<{ id: string; name: string } | null>(null);

  return (
    <Page
      title="Project settings"
      description={`Manage ingestion access and data retention for ${project.name}.`}
      headerClassName="mx-auto w-full max-w-4xl"
      action={
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/$projectId/connect"
          params={{ projectId: project.id }}
        >
          Connect an app <ArrowRight />
        </Link>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion keys</CardTitle>
            <CardDescription>
              Applications use these project-scoped credentials to send telemetry.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (keyName.trim()) createKey.mutate();
              }}
            >
              <Input
                aria-label="Key name"
                className="sm:max-w-sm"
                placeholder="Key name, e.g. Production"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
              />
              <Button type="submit" disabled={!keyName.trim() || createKey.isPending}>
                {createKey.isPending ? <Spinner /> : <Plus />}
                Create key
              </Button>
            </form>

            {createKey.error ? <ErrorAlert error={createKey.error} /> : null}
            {newKey ? <SecretReveal credentials={newKey} onClose={() => setNewKey(null)} /> : null}

            <div className="overflow-hidden rounded-xl border">
              {keys.isPending ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Spinner /> Loading ingestion keys
                </div>
              ) : keys.data?.items.length ? (
                <div className="divide-y">
                  {keys.data.items.map((key) => {
                    const revoked = Boolean(key.revokedAt);
                    return (
                      <div className="flex items-center gap-3 px-4 py-3" key={key.id}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{key.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {revoked ? "Revoked" : "Active"}
                            </span>
                          </div>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {key.publicKey}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Last used {formatKeyDate(key.lastUsedAt)}
                          </p>
                        </div>
                        {!revoked ? (
                          <Button
                            aria-label={`Revoke ${key.name}`}
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setKeyToRevoke({ id: key.id, name: key.name })}
                          >
                            <Trash />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium">No ingestion keys</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a key to connect your first application.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data retention</CardTitle>
            <CardDescription>Choose how long this project keeps telemetry.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field className="max-w-sm">
              <FieldLabel htmlFor="retention">Retention period</FieldLabel>
              <NativeSelect
                className="w-full"
                id="retention"
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
              >
                <NativeSelectOption value="7">7 days</NativeSelectOption>
                <NativeSelectOption value="30">30 days</NativeSelectOption>
                <NativeSelectOption value="90">90 days</NativeSelectOption>
                <NativeSelectOption value="unlimited">Unlimited</NativeSelectOption>
              </NativeSelect>
              <FieldDescription>Expired data is removed asynchronously.</FieldDescription>
            </Field>
            <Button
              className="w-fit"
              disabled={saveSettings.isPending}
              onClick={() => saveSettings.mutate()}
            >
              {saveSettings.isPending ? <Spinner /> : saveSettings.isSuccess ? <Check /> : null}
              {saveSettings.isSuccess ? "Saved" : "Save retention"}
            </Button>
            {saveSettings.error ? (
              <div>
                <ErrorAlert error={saveSettings.error} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={keyToRevoke !== null}
        onOpenChange={(open) => !open && setKeyToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this ingestion key?</AlertDialogTitle>
            <AlertDialogDescription>
              {keyToRevoke?.name} will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={revokeKey.isPending}
              onClick={() => {
                if (!keyToRevoke) return;
                revokeKey.mutate(keyToRevoke.id, { onSuccess: () => setKeyToRevoke(null) });
              }}
            >
              {revokeKey.isPending ? <Spinner /> : <Trash />}
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function formatKeyDate(value: string | null) {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
