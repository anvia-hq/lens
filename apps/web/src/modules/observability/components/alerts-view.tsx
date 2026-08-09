import {
  type AlertIncident,
  type AlertRule,
  type AlertRuleInput,
  type AlertRuleKind,
  alertRuleInputSchema,
  alertRuleKinds,
  type QualityGate,
} from "@lens/contracts";
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
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Checkbox } from "@lens/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { Bell, Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { AlertsState } from "../hooks/use-alerts";
import { LoadingRows } from "./loading-rows";

const kindLabels: Record<AlertRuleKind, string> = {
  trace_error_rate: "Trace error rate",
  trace_p95_latency_ms: "Trace P95 latency",
  tool_error_rate: "Tool error rate",
  failed_human_review: "Failed human review",
  failed_quality_gate: "Failed quality gate",
};

export function AlertsView({ state }: { state: AlertsState }) {
  const [editing, setEditing] = useState<AlertRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";

  return (
    <Page
      title="Alerts"
      description="Catch runtime regressions and quality failures without leaving Lens."
      action={
        canManage && state.filters.tab === "rules" ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> New rule
          </Button>
        ) : undefined
      }
    >
      <Tabs
        value={state.filters.tab}
        onValueChange={(value) =>
          state.setFilters({ tab: value as "incidents" | "rules", page: 1 })
        }
      >
        <TabsList>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="incidents">
          <IncidentList state={state} />
        </TabsContent>
        <TabsContent value="rules">
          <RuleList
            state={state}
            canManage={canManage}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        </TabsContent>
      </Tabs>

      <RuleDialog
        item={editing}
        gates={state.gates.data?.items ?? []}
        saving={state.createRule.isPending || state.updateRule.isPending}
        error={state.createRule.error ?? state.updateRule.error}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (editing === "new") {
            state.createRule.mutate(input, { onSuccess: () => setEditing(null) });
          } else if (editing) {
            state.updateRule.mutate(
              { id: editing.id, input },
              { onSuccess: () => setEditing(null) },
            );
          }
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Active incidents from this rule will be resolved. Incident history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={state.deleteRule.isPending}
              onClick={() =>
                deleting &&
                state.deleteRule.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }
            >
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function IncidentList({ state }: { state: AlertsState }) {
  const incidents = state.incidents.data?.items ?? [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <NativeSelect
          aria-label="Incident status"
          value={state.filters.status}
          onChange={(event) =>
            state.setFilters({ status: event.target.value as "active" | "resolved", page: 1 })
          }
        >
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Alert type"
          value={state.filters.kind ?? ""}
          onChange={(event) =>
            state.setFilters({
              kind: (event.target.value || undefined) as AlertRuleKind | undefined,
              page: 1,
            })
          }
        >
          <NativeSelectOption value="">All types</NativeSelectOption>
          {alertRuleKinds.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {kindLabels[kind]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {state.incidents.error ? <ErrorAlert error={state.incidents.error} /> : null}
      {state.incidents.isLoading ? (
        <div className="overflow-hidden rounded-lg border">
          <LoadingRows />
        </div>
      ) : incidents.length ? (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Alert</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Triggered</TableHead>
                <TableHead>Evidence</TableHead>
                {state.filters.status === "active" ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>
                    <div className="grid min-w-60 gap-0.5">
                      <Link
                        className="font-medium hover:underline"
                        to="/$projectId/alerts/$incidentId"
                        params={{ projectId: state.project.id, incidentId: incident.id }}
                        search={state.filters}
                      >
                        {incident.ruleName}
                      </Link>
                      <span className="text-xs text-muted-foreground">{incident.summary}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge incident={incident} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatValue(incident)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(incident.firstTriggeredAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Evidence incident={incident} projectId={state.project.id} />
                  </TableCell>
                  {state.filters.status === "active" ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {incident.status === "open" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={state.acknowledge.isPending}
                            onClick={() => state.acknowledge.mutate(incident.id)}
                          >
                            <Check /> Acknowledge
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={state.resolve.isPending}
                          onClick={() => state.resolve.mutate(incident.id)}
                        >
                          Resolve
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={<Bell />}
          title={`No ${state.filters.status} alerts`}
          text="Incidents will appear here when a rule is breached."
        />
      )}
      {(state.incidents.data?.pageCount ?? 0) > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button
            size="sm"
            variant="outline"
            disabled={state.filters.page <= 1}
            onClick={() => state.setFilters({ page: state.filters.page - 1 })}
          >
            Previous
          </Button>
          <span>
            Page {state.filters.page} of {state.incidents.data?.pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={state.filters.page >= (state.incidents.data?.pageCount ?? 1)}
            onClick={() => state.setFilters({ page: state.filters.page + 1 })}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RuleList(props: {
  state: AlertsState;
  canManage: boolean;
  onEdit: (rule: AlertRule) => void;
  onDelete: (rule: AlertRule) => void;
}) {
  const rules = props.state.rules.data?.items ?? [];
  if (props.state.rules.error) return <ErrorAlert error={props.state.rules.error} />;
  if (props.state.rules.isLoading)
    return (
      <div className="overflow-hidden rounded-lg border">
        <LoadingRows />
      </div>
    );
  if (!rules.length)
    return (
      <EmptyState
        icon={<Bell />}
        title="No alert rules"
        text="Create a rule to watch runtime health or quality signals."
      />
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead>Rule</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Status</TableHead>
            {props.canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <div className="grid min-w-44 gap-0.5">
                  <span className="font-medium">{rule.name}</span>
                  <span className="text-xs text-muted-foreground">{kindLabels[rule.kind]}</span>
                </div>
              </TableCell>
              <TableCell>{scopeLabel(rule)}</TableCell>
              <TableCell>{conditionLabel(rule, props.state.gates.data?.items ?? [])}</TableCell>
              <TableCell>
                <Badge variant={rule.enabled ? "secondary" : "outline"}>
                  {rule.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </TableCell>
              {props.canManage ? (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => props.onEdit(rule)}>
                      <PencilSimple /> Edit
                    </Button>
                    <Button
                      aria-label={`Delete ${rule.name}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => props.onDelete(rule)}
                    >
                      <Trash />
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type RuleDraft = {
  name: string;
  kind: AlertRuleKind;
  enabled: boolean;
  threshold: string;
  windowMinutes: "5" | "15" | "60";
  minimumSamples: string;
  environment: string;
  serviceName: string;
  toolName: string;
  qualityGateId: string;
};

function RuleDialog(props: {
  item: AlertRule | "new" | null;
  gates: QualityGate[];
  saving: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: (input: AlertRuleInput) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  useEffect(
    () => setDraft(props.item && props.item !== "new" ? ruleDraft(props.item) : emptyDraft()),
    [props.item],
  );
  const parsed = alertRuleInputSchema.safeParse(ruleInput(draft));
  const runtime = isRuntime(draft.kind);
  return (
    <Dialog open={props.item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>
            {props.item === "new" ? "Create alert rule" : "Edit alert rule"}
          </DialogTitle>
          <DialogDescription>
            Choose a signal and the condition that should open an incident.
          </DialogDescription>
        </DialogHeader>
        <form
          id="alert-rule-form"
          className="grid max-h-[68vh] gap-4 overflow-y-auto px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed.success && !props.saving) props.onSave(parsed.data);
          }}
        >
          <Field>
            <FieldLabel htmlFor="alert-name">Name</FieldLabel>
            <Input
              id="alert-name"
              autoFocus
              value={draft.name}
              placeholder="Production error spike"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="alert-kind">Trigger</FieldLabel>
            <NativeSelect
              id="alert-kind"
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as AlertRuleKind })
              }
            >
              {alertRuleKinds.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {kindLabels[kind]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {runtime ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="alert-threshold">
                    {draft.kind === "trace_p95_latency_ms" ? "Threshold (ms)" : "Threshold (%)"}
                  </FieldLabel>
                  <Input
                    id="alert-threshold"
                    type="number"
                    min="0"
                    step="any"
                    value={draft.threshold}
                    onChange={(event) => setDraft({ ...draft, threshold: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="alert-window">Window</FieldLabel>
                  <NativeSelect
                    id="alert-window"
                    value={draft.windowMinutes}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        windowMinutes: event.target.value as RuleDraft["windowMinutes"],
                      })
                    }
                  >
                    <NativeSelectOption value="5">5 minutes</NativeSelectOption>
                    <NativeSelectOption value="15">15 minutes</NativeSelectOption>
                    <NativeSelectOption value="60">60 minutes</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="alert-samples">Minimum samples</FieldLabel>
                  <Input
                    id="alert-samples"
                    type="number"
                    min="1"
                    step="1"
                    value={draft.minimumSamples}
                    onChange={(event) => setDraft({ ...draft, minimumSamples: event.target.value })}
                  />
                </Field>
              </div>
              <FieldDescription>
                Incidents open after two consecutive breached checks and cool down for 30 minutes
                after resolution.
              </FieldDescription>
            </>
          ) : null}
          {draft.kind === "failed_quality_gate" ? (
            <Field>
              <FieldLabel htmlFor="alert-gate">Quality gate</FieldLabel>
              <NativeSelect
                id="alert-gate"
                value={draft.qualityGateId}
                onChange={(event) => setDraft({ ...draft, qualityGateId: event.target.value })}
              >
                <NativeSelectOption value="">Select a gate</NativeSelectOption>
                {props.gates.map((gate) => (
                  <NativeSelectOption key={gate.id} value={gate.id}>
                    {gate.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="alert-environment">Environment (optional)</FieldLabel>
                <Input
                  id="alert-environment"
                  value={draft.environment}
                  placeholder="production"
                  onChange={(event) => setDraft({ ...draft, environment: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="alert-service">Service (optional)</FieldLabel>
                <Input
                  id="alert-service"
                  value={draft.serviceName}
                  placeholder="api"
                  onChange={(event) => setDraft({ ...draft, serviceName: event.target.value })}
                />
              </Field>
            </div>
          )}
          {draft.kind === "tool_error_rate" ? (
            <Field>
              <FieldLabel htmlFor="alert-tool">Tool name (optional)</FieldLabel>
              <Input
                id="alert-tool"
                value={draft.toolName}
                placeholder="search"
                onChange={(event) => setDraft({ ...draft, toolName: event.target.value })}
              />
            </Field>
          ) : null}
          <Field orientation="horizontal">
            <Checkbox
              id="alert-enabled"
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
            />
            <FieldLabel htmlFor="alert-enabled">Enabled</FieldLabel>
          </Field>
          {!parsed.success && draft.name ? (
            <p className="text-sm text-destructive">{parsed.error.issues[0]?.message}</p>
          ) : null}
          {props.error ? <ErrorAlert error={props.error} /> : null}
        </form>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" type="button" onClick={props.onClose}>
            Cancel
          </Button>
          <Button form="alert-rule-form" type="submit" disabled={!parsed.success || props.saving}>
            {props.saving ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyDraft(): RuleDraft {
  return {
    name: "",
    kind: "trace_error_rate",
    enabled: true,
    threshold: "5",
    windowMinutes: "15",
    minimumSamples: "20",
    environment: "",
    serviceName: "",
    toolName: "",
    qualityGateId: "",
  };
}

function ruleDraft(rule: AlertRule): RuleDraft {
  return {
    ...emptyDraft(),
    name: rule.name,
    kind: rule.kind,
    enabled: rule.enabled,
    threshold:
      "threshold" in rule
        ? String(rule.kind === "trace_p95_latency_ms" ? rule.threshold : rule.threshold * 100)
        : "5",
    windowMinutes:
      "windowMinutes" in rule ? (String(rule.windowMinutes) as RuleDraft["windowMinutes"]) : "15",
    minimumSamples: "minimumSamples" in rule ? String(rule.minimumSamples) : "20",
    environment: "environment" in rule ? (rule.environment ?? "") : "",
    serviceName: "serviceName" in rule ? (rule.serviceName ?? "") : "",
    toolName: "toolName" in rule ? (rule.toolName ?? "") : "",
    qualityGateId: "qualityGateId" in rule ? rule.qualityGateId : "",
  };
}

export function ruleInput(draft: RuleDraft): unknown {
  const base = { name: draft.name, kind: draft.kind, enabled: draft.enabled };
  if (draft.kind === "failed_quality_gate") return { ...base, qualityGateId: draft.qualityGateId };
  const scope = {
    environment: draft.environment || undefined,
    serviceName: draft.serviceName || undefined,
  };
  if (draft.kind === "failed_human_review") return { ...base, ...scope };
  const runtime = {
    ...base,
    ...scope,
    threshold: Number(draft.threshold) / (draft.kind === "trace_p95_latency_ms" ? 1 : 100),
    windowMinutes: Number(draft.windowMinutes),
    minimumSamples: Number(draft.minimumSamples),
  };
  return draft.kind === "tool_error_rate"
    ? { ...runtime, toolName: draft.toolName || undefined }
    : runtime;
}

function isRuntime(kind: AlertRuleKind) {
  return (
    kind === "trace_error_rate" || kind === "trace_p95_latency_ms" || kind === "tool_error_rate"
  );
}

function StatusBadge({ incident }: { incident: AlertIncident }) {
  return (
    <Badge
      variant={
        incident.status === "open"
          ? "destructive"
          : incident.status === "acknowledged"
            ? "secondary"
            : "outline"
      }
    >
      {incident.status}
    </Badge>
  );
}

function formatValue(incident: AlertIncident) {
  if (incident.observedValue === null) return "—";
  if (incident.kind === "trace_p95_latency_ms")
    return `${Math.round(incident.observedValue)} ms / ${Math.round(incident.threshold ?? 0)} ms`;
  return `${(incident.observedValue * 100).toFixed(1)}% / ${((incident.threshold ?? 0) * 100).toFixed(1)}%`;
}

function Evidence({ incident, projectId }: { incident: AlertIncident; projectId: string }) {
  const evidence = incident.evidence;
  if (evidence.traceIds?.length)
    return (
      <div className="flex max-w-52 flex-wrap gap-1">
        {evidence.traceIds.map((traceId) => (
          <Button
            key={traceId}
            size="xs"
            variant="link"
            render={
              <Link to="/$projectId/traces/$traceId" params={{ projectId, traceId }} search={{}} />
            }
          >
            {traceId.slice(0, 8)}
          </Button>
        ))}
      </div>
    );
  if (evidence.qualityGateId && evidence.candidateRunId && evidence.baselineRunId)
    return (
      <Button
        size="sm"
        variant="link"
        render={
          <Link
            to="/$projectId/evaluations/compare"
            params={{ projectId }}
            search={{
              gateId: evidence.qualityGateId,
              candidateRunId: evidence.candidateRunId,
              baselineRunId: evidence.baselineRunId,
            }}
          />
        }
      >
        Open comparison
      </Button>
    );
  return <span className="text-muted-foreground">—</span>;
}

function scopeLabel(rule: AlertRule) {
  if (rule.kind === "failed_quality_gate") return "Selected gate";
  const scopes = [
    rule.environment,
    rule.serviceName,
    rule.kind === "tool_error_rate" ? rule.toolName : undefined,
  ].filter(Boolean);
  return scopes.length ? scopes.join(" · ") : "All telemetry";
}

function conditionLabel(rule: AlertRule, gates: QualityGate[]) {
  if (rule.kind === "failed_quality_gate")
    return gates.find((gate) => gate.id === rule.qualityGateId)?.name ?? "Deleted gate";
  if (rule.kind === "failed_human_review") return "Any failed review";
  const threshold =
    rule.kind === "trace_p95_latency_ms" ? `${rule.threshold} ms` : `${rule.threshold * 100}%`;
  return `${threshold} over ${rule.windowMinutes}m · min ${rule.minimumSamples}`;
}
