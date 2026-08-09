import type { QualityGate, QualityGateInput, QualityGateRule } from "@lens/contracts";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldLabel } from "@lens/ui/components/field";
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
import { Flask, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { QualityGatesState } from "../hooks/use-evaluation-workspace";
import { LoadingRows } from "./loading-rows";

export function QualityGatesView({ state }: { state: QualityGatesState }) {
  const [editing, setEditing] = useState<QualityGate | "new" | null>(null);
  const [deleting, setDeleting] = useState<QualityGate | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  const gates = state.gates.data?.items ?? [];
  const saving = state.createGate.isPending || state.updateGate.isPending;

  return (
    <Page
      title="Quality gates"
      description="Set the checks a run must pass before you approve a release."
      action={
        canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> New gate
          </Button>
        ) : undefined
      }
    >
      {state.gates.error ? <ErrorAlert error={state.gates.error} /> : null}
      {state.gates.isLoading ? (
        <div className="overflow-hidden rounded-lg border">
          <LoadingRows />
        </div>
      ) : gates.length > 0 ? (
        <GateTable gates={gates} canManage={canManage} onEdit={setEditing} onDelete={setDeleting} />
      ) : (
        <EmptyState
          icon={<Flask />}
          title="No quality gates"
          text="Create a gate to apply the same release checks when comparing runs."
        />
      )}

      <GateDialog
        item={editing}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (editing === "new") {
            state.createGate.mutate(input, { onSuccess: () => setEditing(null) });
          } else if (editing) {
            state.updateGate.mutate(
              { id: editing.id, input },
              { onSuccess: () => setEditing(null) },
            );
          }
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quality gate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `“${deleting.name}” will no longer be available when comparing evaluation runs.`
                : "This gate will no longer be available when comparing evaluation runs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={state.deleteGate.isPending}
              onClick={() => {
                if (deleting) {
                  state.deleteGate.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
                }
              }}
            >
              Delete gate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function GateTable(props: {
  gates: QualityGate[];
  canManage: boolean;
  onEdit: (gate: QualityGate) => void;
  onDelete: (gate: QualityGate) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead>Gate</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Requirements</TableHead>
            {props.canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.gates.map((gate) => (
            <TableRow key={gate.id}>
              <TableCell>
                <div className="grid min-w-44 gap-0.5">
                  <span className="font-medium">{gate.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {gate.rules.length} {gate.rules.length === 1 ? "rule" : "rules"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-48 flex-wrap items-center gap-1.5">
                  <span>{gate.suiteName}</span>
                  <Badge variant="secondary">{gate.environment}</Badge>
                </div>
              </TableCell>
              <TableCell>
                <div className="grid min-w-52 gap-0.5">
                  <span>At least {gate.minimumCaseCount} evaluated cases</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {summarizeRules(gate.rules)}
                  </span>
                </div>
              </TableCell>
              {props.canManage ? (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => props.onEdit(gate)}>
                      <PencilSimple /> Edit
                    </Button>
                    <Button
                      aria-label={`Delete ${gate.name}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => props.onDelete(gate)}
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

function GateDialog(props: {
  item: QualityGate | "new" | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: QualityGateInput) => void;
}) {
  const [value, setValue] = useState<QualityGateDraft>(emptyGate());
  useEffect(
    () => setValue(props.item && props.item !== "new" ? gateDraft(props.item) : emptyGate()),
    [props.item],
  );
  const updateRule = (index: number, rule: QualityGateRule) =>
    setValue((current) => ({
      ...current,
      rules: current.rules.map((item, itemIndex) =>
        itemIndex === index ? { ...item, rule } : item,
      ),
    }));
  const input = qualityGateInput(value);
  const valid = isValidGate(input);

  return (
    <Dialog open={props.item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>
            {props.item === "new" ? "Create quality gate" : "Edit quality gate"}
          </DialogTitle>
          <DialogDescription>
            Choose where this gate applies, then add the checks required for approval.
          </DialogDescription>
        </DialogHeader>

        <form
          id="quality-gate-form"
          className="grid max-h-[68vh] gap-6 overflow-y-auto px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !props.saving) props.onSave(input);
          }}
        >
          <section className="grid gap-4">
            <SectionHeading
              title="Gate details"
              description="Name the policy and limit its scope."
            />
            <Field>
              <FieldLabel htmlFor="gate-name">Name</FieldLabel>
              <Input
                id="gate-name"
                autoFocus
                placeholder="Production release"
                value={value.name}
                onChange={(event) => setValue({ ...value, name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="gate-suite">Evaluation suite</FieldLabel>
                <Input
                  id="gate-suite"
                  placeholder="support-agent"
                  value={value.suiteName}
                  onChange={(event) => setValue({ ...value, suiteName: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="gate-environment">Environment</FieldLabel>
                <Input
                  id="gate-environment"
                  placeholder="production"
                  value={value.environment}
                  onChange={(event) => setValue({ ...value, environment: event.target.value })}
                />
              </Field>
            </div>
            <Field className="sm:max-w-56">
              <FieldLabel htmlFor="gate-minimum-cases">Minimum evaluated cases</FieldLabel>
              <Input
                id="gate-minimum-cases"
                min={1}
                max={1_000_000}
                type="number"
                value={value.minimumCaseCount}
                onChange={(event) =>
                  setValue({ ...value, minimumCaseCount: Number(event.target.value) })
                }
              />
            </Field>
          </section>

          <section className="grid gap-3 border-t pt-5">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading
                title="Approval rules"
                description="Every rule must pass for the gate to approve a run."
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setValue({ ...value, rules: [...value.rules, editableRule(defaultRule())] })
                }
              >
                <Plus /> Add rule
              </Button>
            </div>
            <div className="grid gap-3">
              {value.rules.map((item, index) => (
                <GateRuleEditor
                  key={item.id}
                  index={index}
                  rule={item.rule}
                  canRemove={value.rules.length > 1}
                  onChange={(next) => updateRule(index, next)}
                  onRemove={() =>
                    setValue({
                      ...value,
                      rules: value.rules.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                />
              ))}
            </div>
          </section>
        </form>

        <DialogFooter className="m-0 rounded-none px-6 py-4">
          <DialogClose render={<Button type="button" variant="outline" disabled={props.saving} />}>
            Cancel
          </DialogClose>
          <Button form="quality-gate-form" type="submit" disabled={!valid || props.saving}>
            {props.saving ? "Saving…" : props.item === "new" ? "Create gate" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading(props: { title: string; description: string }) {
  return (
    <div className="grid gap-0.5">
      <h3 className="font-medium">{props.title}</h3>
      <p className="text-sm text-muted-foreground">{props.description}</p>
    </div>
  );
}

function GateRuleEditor(props: {
  index: number;
  rule: QualityGateRule;
  canRemove: boolean;
  onChange: (rule: QualityGateRule) => void;
  onRemove: () => void;
}) {
  const rule = props.rule;
  const prefix = `gate-rule-${props.index}`;
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/15 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Rule {props.index + 1}</span>
        <Button
          type="button"
          aria-label={`Remove rule ${props.index + 1}`}
          disabled={!props.canRemove}
          size="icon-sm"
          variant="ghost"
          onClick={props.onRemove}
        >
          <Trash />
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor={`${prefix}-type`}>Check</FieldLabel>
        <NativeSelect
          id={`${prefix}-type`}
          value={rule.type}
          onChange={(event) =>
            props.onChange(ruleForType(event.target.value as QualityGateRule["type"]))
          }
        >
          <NativeSelectOption value="evaluation_threshold">
            Metric meets a target
          </NativeSelectOption>
          <NativeSelectOption value="evaluation_regression">
            Metric change stays within a limit
          </NativeSelectOption>
          <NativeSelectOption value="operational_regression">
            Operational metric stays within a limit
          </NativeSelectOption>
        </NativeSelect>
      </Field>

      {rule.type === "operational_regression" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${prefix}-measure`}>Measure</FieldLabel>
            <NativeSelect
              id={`${prefix}-measure`}
              value={rule.measure}
              onChange={(event) =>
                props.onChange({
                  ...rule,
                  measure: event.target.value as "p95_latency_ms" | "average_total_tokens",
                })
              }
            >
              <NativeSelectOption value="p95_latency_ms">
                P95 trace-duration change
              </NativeSelectOption>
              <NativeSelectOption value="average_total_tokens">Average tokens</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-increase`}>Maximum increase (%)</FieldLabel>
            <Input
              id={`${prefix}-increase`}
              min={0}
              step="0.1"
              type="number"
              value={rule.maxIncreasePercent}
              onChange={(event) =>
                props.onChange({ ...rule, maxIncreasePercent: Number(event.target.value) })
              }
            />
          </Field>
        </div>
      ) : (
        <EvaluationRuleFields prefix={prefix} rule={rule} onChange={props.onChange} />
      )}
    </div>
  );
}

function EvaluationRuleFields(props: {
  prefix: string;
  rule: Exclude<QualityGateRule, { type: "operational_regression" }>;
  onChange: (rule: QualityGateRule) => void;
}) {
  const rule = props.rule;
  const percentage = rule.measure === "pass_rate";
  const numericValue = rule.type === "evaluation_threshold" ? rule.value : rule.maxAbsoluteChange;
  const displayedValue = percentage ? toPercent(numericValue) : numericValue;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${props.prefix}-metric`}>Metric</FieldLabel>
          <Input
            id={`${props.prefix}-metric`}
            placeholder="correctness"
            value={rule.metricName}
            onChange={(event) => props.onChange({ ...rule, metricName: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${props.prefix}-measure`}>Measure</FieldLabel>
          <NativeSelect
            id={`${props.prefix}-measure`}
            value={rule.measure}
            onChange={(event) =>
              props.onChange({
                ...rule,
                measure: event.target.value as "pass_rate" | "average_score",
              })
            }
          >
            <NativeSelectOption value="pass_rate">Pass rate</NativeSelectOption>
            <NativeSelectOption value="average_score">Average score</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>

      {rule.type === "evaluation_threshold" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${props.prefix}-operator`}>Requirement</FieldLabel>
            <NativeSelect
              id={`${props.prefix}-operator`}
              value={rule.operator}
              onChange={(event) =>
                props.onChange({ ...rule, operator: event.target.value as "gte" | "lte" })
              }
            >
              <NativeSelectOption value="gte">At least</NativeSelectOption>
              <NativeSelectOption value="lte">At most</NativeSelectOption>
            </NativeSelect>
          </Field>
          <RuleValueField
            id={`${props.prefix}-value`}
            label={percentage ? "Target (%)" : "Target value"}
            percentage={percentage}
            value={displayedValue}
            onChange={(next) =>
              props.onChange({ ...rule, value: percentage ? fromPercent(next) : next })
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${props.prefix}-direction`}>Allowed change</FieldLabel>
            <NativeSelect
              id={`${props.prefix}-direction`}
              value={rule.direction}
              onChange={(event) =>
                props.onChange({
                  ...rule,
                  direction: event.target.value as "decrease" | "increase",
                })
              }
            >
              <NativeSelectOption value="decrease">Decrease by no more than</NativeSelectOption>
              <NativeSelectOption value="increase">Increase by no more than</NativeSelectOption>
            </NativeSelect>
          </Field>
          <RuleValueField
            id={`${props.prefix}-change`}
            label={percentage ? "Maximum change (percentage points)" : "Maximum change"}
            percentage={percentage}
            value={displayedValue}
            onChange={(next) =>
              props.onChange({
                ...rule,
                maxAbsoluteChange: percentage ? fromPercent(next) : next,
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function RuleValueField(props: {
  id: string;
  label: string;
  percentage: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        min={props.percentage ? 0 : undefined}
        max={props.percentage ? 100 : undefined}
        step="0.1"
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function defaultRule(): QualityGateRule {
  return {
    type: "evaluation_threshold",
    metricName: "",
    measure: "pass_rate",
    operator: "gte",
    value: 0.9,
  };
}

type QualityGateDraft = Omit<QualityGateInput, "rules"> & {
  rules: Array<{ id: string; rule: QualityGateRule }>;
};

let nextRuleId = 0;

function editableRule(rule: QualityGateRule): QualityGateDraft["rules"][number] {
  nextRuleId += 1;
  return { id: `quality-gate-rule-${nextRuleId}`, rule };
}

function ruleForType(type: QualityGateRule["type"]): QualityGateRule {
  if (type === "evaluation_regression") {
    return {
      type,
      metricName: "",
      measure: "pass_rate",
      direction: "decrease",
      maxAbsoluteChange: 0.05,
    };
  }
  if (type === "operational_regression") {
    return { type, measure: "p95_latency_ms", maxIncreasePercent: 15 };
  }
  return defaultRule();
}

function emptyGate(): QualityGateDraft {
  return {
    name: "",
    suiteName: "",
    environment: "production",
    minimumCaseCount: 1,
    rules: [editableRule(defaultRule())],
  };
}

function gateDraft(gate: QualityGate): QualityGateDraft {
  return {
    name: gate.name,
    suiteName: gate.suiteName,
    environment: gate.environment,
    minimumCaseCount: gate.minimumCaseCount,
    rules: gate.rules.map(editableRule),
  };
}

function qualityGateInput(gate: QualityGateDraft): QualityGateInput {
  return {
    name: gate.name,
    suiteName: gate.suiteName,
    environment: gate.environment,
    minimumCaseCount: gate.minimumCaseCount,
    rules: gate.rules.map((item) => item.rule),
  };
}

function isValidGate(gate: QualityGateInput): boolean {
  return (
    gate.name.trim().length > 0 &&
    gate.suiteName.trim().length > 0 &&
    gate.environment.trim().length > 0 &&
    Number.isInteger(gate.minimumCaseCount) &&
    gate.minimumCaseCount >= 1 &&
    gate.rules.length > 0 &&
    gate.rules.every((rule) => {
      if (rule.type === "operational_regression") {
        return Number.isFinite(rule.maxIncreasePercent) && rule.maxIncreasePercent >= 0;
      }
      const value = rule.type === "evaluation_threshold" ? rule.value : rule.maxAbsoluteChange;
      return (
        rule.metricName.trim().length > 0 &&
        Number.isFinite(value) &&
        value >= 0 &&
        (rule.measure !== "pass_rate" || value <= 1)
      );
    })
  );
}

function summarizeRules(rules: QualityGateRule[]): string {
  const kinds = new Set(rules.map((rule) => rule.type));
  const labels = [
    kinds.has("evaluation_threshold") ? "targets" : null,
    kinds.has("evaluation_regression") ? "metric changes" : null,
    kinds.has("operational_regression") ? "operational changes" : null,
  ].filter((label): label is string => label !== null);
  return labels.join(" · ");
}

function toPercent(value: number): number {
  return Number((value * 100).toFixed(6));
}

function fromPercent(value: number): number {
  return value / 100;
}
