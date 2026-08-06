import { Button } from "@lens/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Spinner } from "@lens/ui/components/spinner";
import { Textarea } from "@lens/ui/components/textarea";
import { BracketsCurly as Braces, Check, Database, Key as KeyRound } from "@phosphor-icons/react";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { ProjectSettingsState } from "../hooks/use-project-settings";
import { SecretReveal } from "./secret-reveal";
import { StatusBadge } from "./status-badge";
export function ProjectSettings({ state }: { state: ProjectSettingsState }) {
  const {
    createKey,
    keyName,
    keys,
    newKey,
    patterns,
    retention,
    saveSettings,
    setKeyName,
    setNewKey,
    setPatterns,
    setRetention,
  } = state;
  return (
    <Page
      title="Project settings"
      description="Control ingestion access and telemetry data handling"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion keys</CardTitle>
            <CardDescription>
              Keys authorize OTLP writes and cannot read trace data.
            </CardDescription>
            <CardAction>
              <KeyRound className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
              <Button disabled={createKey.isPending} onClick={() => createKey.mutate()}>
                Create key
              </Button>
            </div>
            {createKey.error ? <ErrorAlert error={createKey.error} /> : null}
            {newKey ? <SecretReveal credentials={newKey} onClose={() => setNewKey(null)} /> : null}
            <div className="grid gap-2">
              {keys.data?.items.map((key) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={key.id}>
                  <span className="grid min-w-0 flex-1">
                    <span className="font-medium">{key.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {key.publicKey}
                    </span>
                  </span>
                  <StatusBadge status={key.revokedAt ? "error" : "ok"} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Retention</CardTitle>
            <CardDescription>
              Changes apply asynchronously to existing and future traces.
            </CardDescription>
            <CardAction>
              <Database className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="retention">Retention period</FieldLabel>
              <NativeSelect
                id="retention"
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="7">7 days</NativeSelectOption>
                <NativeSelectOption value="30">30 days</NativeSelectOption>
                <NativeSelectOption value="90">90 days</NativeSelectOption>
                <NativeSelectOption value="unlimited">Unlimited</NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Expired traces are removed by the maintenance worker.
              </FieldDescription>
            </Field>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attribute redaction</CardTitle>
            <CardDescription>
              One case-insensitive attribute glob per line. Matching values are replaced before
              queueing.
            </CardDescription>
            <CardAction>
              <Braces className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="patterns">Redaction patterns</FieldLabel>
                <Textarea
                  id="patterns"
                  rows={7}
                  value={patterns}
                  onChange={(event) => setPatterns(event.target.value)}
                  placeholder="metadata.secret\nanvia.run.prompt"
                />
                <FieldDescription>Redacted values cannot be recovered.</FieldDescription>
              </Field>
              {saveSettings.error ? <ErrorAlert error={saveSettings.error} /> : null}
              <Button
                className="self-end"
                disabled={saveSettings.isPending}
                onClick={() => saveSettings.mutate()}
              >
                {saveSettings.isPending ? <Spinner /> : saveSettings.isSuccess ? <Check /> : null}
                {saveSettings.isSuccess ? "Saved" : "Save data settings"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
