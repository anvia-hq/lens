import type { QualityGate, QualityGateInput, QualityGateRule } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Flask, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { QualityGatesState } from "../hooks/use-evaluation-workspace";

export function QualityGatesView({ state }: { state: QualityGatesState }) {
  const [editing, setEditing] = useState<QualityGate | "new" | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  return (
    <Page
      title="Quality gates"
      description="Define reusable release policies for each suite and environment"
    >
      {state.gates.error ? <ErrorAlert error={state.gates.error} /> : null}
      <div className="flex justify-end">
        {canManage ? (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Create gate
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {state.gates.data?.items.map((gate) => (
          <Card key={gate.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{gate.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {gate.suiteName} · {gate.environment}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(gate)}>
                    Edit
                  </Button>
                  <Button
                    aria-label={`Delete ${gate.name}`}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => state.deleteGate.mutate(gate.id)}
                  >
                    <Trash />
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="text-sm">
              <p>Minimum {gate.minimumCaseCount} cases</p>
              <p className="text-muted-foreground">{gate.rules.length} policy rules</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {state.gates.data?.items.length === 0 ? (
        <EmptyState
          icon={<Flask />}
          title="No quality gates"
          text="Create a named policy and apply it when comparing runs."
        />
      ) : null}
      <GateDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (editing === "new")
            state.createGate.mutate(input, { onSuccess: () => setEditing(null) });
          else if (editing)
            state.updateGate.mutate(
              { id: editing.id, input },
              { onSuccess: () => setEditing(null) },
            );
        }}
      />
    </Page>
  );
}

function GateDialog(props: {
  item: QualityGate | "new" | null;
  onClose: () => void;
  onSave: (input: QualityGateInput) => void;
}) {
  const [value, setValue] = useState<QualityGateInput>(emptyGate());
  useEffect(
    () => setValue(props.item && props.item !== "new" ? gateInput(props.item) : emptyGate()),
    [props.item],
  );
  const updateRule = (index: number, rule: QualityGateRule) =>
    setValue((current) => ({
      ...current,
      rules: current.rules.map((item, itemIndex) => (itemIndex === index ? rule : item)),
    }));
  return (
    <Dialog open={props.item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {props.item === "new" ? "Create quality gate" : "Edit quality gate"}
          </DialogTitle>
          <DialogDescription>
            Rules are evaluated live against a candidate and baseline run.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={value.name}
                onChange={(event) => setValue({ ...value, name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Minimum cases</FieldLabel>
              <Input
                min={1}
                type="number"
                value={value.minimumCaseCount}
                onChange={(event) =>
                  setValue({ ...value, minimumCaseCount: Number(event.target.value) })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Suite</FieldLabel>
              <Input
                value={value.suiteName}
                onChange={(event) => setValue({ ...value, suiteName: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Environment</FieldLabel>
              <Input
                value={value.environment}
                onChange={(event) => setValue({ ...value, environment: event.target.value })}
              />
            </Field>
          </div>
          {value.rules.map((rule, index) => (
            <GateRuleEditor
              key={ruleKey(rule, index)}
              rule={rule}
              onChange={(next) => updateRule(index, next)}
              onRemove={() =>
                setValue({
                  ...value,
                  rules: value.rules.filter((_, itemIndex) => itemIndex !== index),
                })
              }
            />
          ))}
          <Button
            className="w-fit"
            variant="outline"
            onClick={() => setValue({ ...value, rules: [...value.rules, defaultRule()] })}
          >
            <Plus /> Add rule
          </Button>
        </div>
        <DialogFooter showCloseButton>
          <Button
            disabled={
              !value.name.trim() ||
              !value.suiteName.trim() ||
              !value.environment.trim() ||
              value.rules.length === 0
            }
            onClick={() => props.onSave(value)}
          >
            Save gate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateRuleEditor(props: {
  rule: QualityGateRule;
  onChange: (rule: QualityGateRule) => void;
  onRemove: () => void;
}) {
  const rule = props.rule;
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
      <Field>
        <FieldLabel>Rule type</FieldLabel>
        <NativeSelect
          value={rule.type}
          onChange={(event) =>
            props.onChange(ruleForType(event.target.value as QualityGateRule["type"]))
          }
        >
          <NativeSelectOption value="evaluation_threshold">Evaluation threshold</NativeSelectOption>
          <NativeSelectOption value="evaluation_regression">
            Evaluation regression
          </NativeSelectOption>
          <NativeSelectOption value="operational_regression">
            Operational regression
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      {rule.type !== "operational_regression" ? (
        <>
          <Field>
            <FieldLabel>Metric</FieldLabel>
            <Input
              value={rule.metricName}
              onChange={(event) => props.onChange({ ...rule, metricName: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Measure</FieldLabel>
            <NativeSelect
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
          {rule.type === "evaluation_threshold" ? (
            <Field>
              <FieldLabel>Condition</FieldLabel>
              <div className="flex gap-2">
                <NativeSelect
                  value={rule.operator}
                  onChange={(event) =>
                    props.onChange({ ...rule, operator: event.target.value as "gte" | "lte" })
                  }
                >
                  <NativeSelectOption value="gte">At least</NativeSelectOption>
                  <NativeSelectOption value="lte">At most</NativeSelectOption>
                </NativeSelect>
                <Input
                  type="number"
                  value={rule.value}
                  onChange={(event) =>
                    props.onChange({ ...rule, value: Number(event.target.value) })
                  }
                />
              </div>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Maximum change</FieldLabel>
              <div className="flex gap-2">
                <NativeSelect
                  value={rule.direction}
                  onChange={(event) =>
                    props.onChange({
                      ...rule,
                      direction: event.target.value as "decrease" | "increase",
                    })
                  }
                >
                  <NativeSelectOption value="decrease">Decrease</NativeSelectOption>
                  <NativeSelectOption value="increase">Increase</NativeSelectOption>
                </NativeSelect>
                <Input
                  min={0}
                  type="number"
                  value={rule.maxAbsoluteChange}
                  onChange={(event) =>
                    props.onChange({ ...rule, maxAbsoluteChange: Number(event.target.value) })
                  }
                />
              </div>
            </Field>
          )}
        </>
      ) : (
        <>
          <Field>
            <FieldLabel>Measure</FieldLabel>
            <NativeSelect
              value={rule.measure}
              onChange={(event) =>
                props.onChange({
                  ...rule,
                  measure: event.target.value as "p95_latency_ms" | "average_total_tokens",
                })
              }
            >
              <NativeSelectOption value="p95_latency_ms">P95 latency</NativeSelectOption>
              <NativeSelectOption value="average_total_tokens">Average tokens</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Maximum increase %</FieldLabel>
            <Input
              min={0}
              type="number"
              value={rule.maxIncreasePercent}
              onChange={(event) =>
                props.onChange({ ...rule, maxIncreasePercent: Number(event.target.value) })
              }
            />
          </Field>
        </>
      )}
      <Button className="self-end" size="icon-sm" variant="ghost" onClick={props.onRemove}>
        <Trash />
      </Button>
    </div>
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
function ruleForType(type: QualityGateRule["type"]): QualityGateRule {
  if (type === "evaluation_regression")
    return {
      type,
      metricName: "",
      measure: "pass_rate",
      direction: "decrease",
      maxAbsoluteChange: 0.05,
    };
  if (type === "operational_regression")
    return { type, measure: "p95_latency_ms", maxIncreasePercent: 15 };
  return defaultRule();
}
function emptyGate(): QualityGateInput {
  return {
    name: "",
    suiteName: "",
    environment: "production",
    minimumCaseCount: 1,
    rules: [defaultRule()],
  };
}
function gateInput(gate: QualityGate): QualityGateInput {
  return {
    name: gate.name,
    suiteName: gate.suiteName,
    environment: gate.environment,
    minimumCaseCount: gate.minimumCaseCount,
    rules: gate.rules,
  };
}

function ruleKey(rule: QualityGateRule, index: number): string {
  return `${JSON.stringify(rule)}:${index}`;
}
