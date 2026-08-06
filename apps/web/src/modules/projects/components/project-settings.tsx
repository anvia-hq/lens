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
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Spinner } from "@lens/ui/components/spinner";
import { Textarea } from "@lens/ui/components/textarea";
import {
  ArrowRight,
  BracketsCurly as Braces,
  Check,
  Database,
  Key as KeyRound,
  LockKey,
  Plus,
  ShieldCheck,
  Trash,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
    patterns,
    project,
    retention,
    revokeKey,
    saveSettings,
    setKeyName,
    setNewKey,
    setPatterns,
    setRetention,
  } = state;
  const [keyToRevoke, setKeyToRevoke] = useState<{ id: string; name: string } | null>(null);
  const activeKeys = keys.data?.items.filter((key) => !key.revokedAt).length ?? 0;

  return (
    <Page
      eyebrow="Project configuration"
      title="Settings"
      description={`Manage access and telemetry data handling for ${project.name}`}
      action={
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/$projectId/connect"
          params={{ projectId: project.id }}
        >
          Connection guide <ArrowRight />
        </Link>
      }
    >
      <div className="grid overflow-hidden rounded-xl border bg-card xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-5 xl:border-r xl:border-b-0">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Project controls</h2>
              <p className="text-xs text-muted-foreground">Access and data policy</p>
            </div>
          </div>

          <nav className="mt-6 grid gap-1" aria-label="Settings sections">
            <SettingsLink href="#ingestion-access" icon={<KeyRound />} label="Ingestion access" />
            <SettingsLink href="#data-controls" icon={<Database />} label="Data controls" />
          </nav>

          <div className="mt-6 border-t pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Access summary
            </p>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Active keys</span>
              <span className="font-mono font-medium tabular-nums">{activeKeys}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Retention</span>
              <span className="font-medium">
                {retention === "unlimited" ? "Unlimited" : `${retention} days`}
              </span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 divide-y">
          <section className="grid gap-6 p-4 md:p-6" id="ingestion-access">
            <SectionHeading
              icon={<LockKey />}
              title="Ingestion access"
              description="Create project-scoped credentials for applications that send telemetry. Keys can write data, but cannot read it."
            />

            <form
              className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                if (keyName.trim()) createKey.mutate();
              }}
            >
              <Input
                aria-label="Key name"
                className="bg-background sm:max-w-sm"
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
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_10rem_6rem]">
                <span>Key</span>
                <span className="hidden sm:block">Last used</span>
                <span>Status</span>
              </div>
              {keys.isPending ? (
                <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
                  <Spinner /> Loading ingestion keys
                </div>
              ) : keys.data?.items.length ? (
                <div className="divide-y">
                  {keys.data.items.map((key) => {
                    const revoked = Boolean(key.revokedAt);
                    return (
                      <div
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_6rem]"
                        key={key.id}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{key.name}</span>
                            {!revoked ? (
                              <Button
                                aria-label={`Revoke ${key.name}`}
                                className="transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => setKeyToRevoke({ id: key.id, name: key.name })}
                              >
                                <Trash />
                              </Button>
                            ) : null}
                          </div>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {key.publicKey}
                          </p>
                        </div>
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          {formatKeyDate(key.lastUsedAt)}
                        </span>
                        <span
                          className={
                            revoked
                              ? "w-fit rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-300/15 dark:text-slate-300"
                              : "w-fit rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-300"
                          }
                        >
                          {revoked ? "Revoked" : "Active"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium">No ingestion keys yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a key to connect your first application.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 p-4 md:p-6" id="data-controls">
            <SectionHeading
              icon={<Database />}
              title="Data controls"
              description="Choose how long telemetry is stored and remove sensitive attributes before they enter the queue."
            />

            <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <Field>
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
                <FieldDescription>
                  Expired traces are removed asynchronously after saving.
                </FieldDescription>
              </Field>

              <Field>
                <div className="flex items-center gap-2">
                  <Braces className="size-4 text-muted-foreground" />
                  <FieldLabel htmlFor="patterns">Attribute redaction</FieldLabel>
                </div>
                <Textarea
                  className="min-h-36 resize-y font-mono text-xs leading-5"
                  id="patterns"
                  value={patterns}
                  onChange={(event) => setPatterns(event.target.value)}
                  placeholder={"metadata.secret\nanvia.run.prompt"}
                />
                <FieldDescription>
                  Enter one case-insensitive attribute glob per line. Matching values are replaced
                  permanently before queueing.
                </FieldDescription>
              </Field>
            </div>

            {saveSettings.error ? <ErrorAlert error={saveSettings.error} /> : null}
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                Changes apply to future telemetry and are reconciled with existing data.
              </p>
              <Button
                className="shrink-0"
                disabled={saveSettings.isPending}
                onClick={() => saveSettings.mutate()}
              >
                {saveSettings.isPending ? <Spinner /> : saveSettings.isSuccess ? <Check /> : null}
                {saveSettings.isSuccess ? "Settings saved" : "Save data controls"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <AlertDialog
        open={keyToRevoke !== null}
        onOpenChange={(open) => !open && setKeyToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this ingestion key?</AlertDialogTitle>
            <AlertDialogDescription>
              {keyToRevoke?.name} will stop working immediately. Applications using it will no
              longer be able to send telemetry.
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

function SettingsLink(props: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
      href={props.href}
    >
      {props.icon}
      {props.label}
    </a>
  );
}

function SectionHeading(props: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground [&_svg]:size-4">
        {props.icon}
      </span>
      <div className="grid gap-1">
        <h2 className="font-heading text-base font-medium">{props.title}</h2>
        <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}

function formatKeyDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
