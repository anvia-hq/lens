import type {
  EvaluationRunSummary,
  QualityGate,
  QualityGateInput,
  QualityGateRule,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { ArrowLeft, Flask, Plus, Trash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { EvaluationWorkspaceState } from "../hooks/use-evaluation-workspace";
import type { EvaluationsSearch } from "../types";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";

const views = [
  ["runs", "Runs"],
  ["compare", "Compare"],
  ["results", "Results"],
  ["gates", "Gates"],
] as const;

export function EvaluationNavigation(props: {
  view: NonNullable<EvaluationsSearch["view"]>;
  onChange: (view: NonNullable<EvaluationsSearch["view"]>) => void;
}) {
  return (
    <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1" aria-label="Evaluation views">
      {views.map(([view, label]) => (
        <Button
          key={view}
          size="sm"
          variant={props.view === view ? "secondary" : "ghost"}
          onClick={() => props.onChange(view)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

export function EvaluationWorkspaceView({ state }: { state: EvaluationWorkspaceState }) {
  const navigation = (
    <EvaluationNavigation
      view={state.filters.view}
      onChange={(view) => state.setFilters({ view, runId: undefined })}
    />
  );
  if (state.filters.view === "compare") {
    return (
      <Page
        title="Compare evaluation runs"
        description="Measure release quality and apply a saved gate"
      >
        {navigation}
        <CompareView state={state} />
      </Page>
    );
  }
  if (state.filters.view === "gates") {
    return (
      <Page
        title="Quality gates"
        description="Define reusable release policies for each suite and environment"
      >
        {navigation}
        <GatesView state={state} />
      </Page>
    );
  }
  return (
    <Page
      title="Evaluation runs"
      description="Complete suite executions grouped by release and environment"
    >
      {navigation}
      <RunsView state={state} />
    </Page>
  );
}

function RunsView({ state }: { state: EvaluationWorkspaceState }) {
  if (state.filters.runId) return <RunDetail state={state} />;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle>Runs</CardTitle>
        <NativeSelect
          aria-label="Filter run status"
          value={state.filters.status ?? ""}
          onChange={(event) =>
            state.setFilters({
              status: (event.target.value || undefined) as EvaluationsSearch["status"],
              page: 1,
            })
          }
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          <NativeSelectOption value="running">Running</NativeSelectOption>
          <NativeSelectOption value="completed">Completed</NativeSelectOption>
          <NativeSelectOption value="failed">Failed</NativeSelectOption>
        </NativeSelect>
      </CardHeader>
      {state.runs.error ? <ErrorAlert error={state.runs.error} /> : null}
      {state.runs.data?.items.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Started</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Release</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cases</TableHead>
              <TableHead>Pass rate</TableHead>
              <TableHead className="pr-4">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.runs.data.items.map((run) => (
              <TableRow
                className="cursor-pointer"
                key={run.id}
                onClick={() => state.setFilters({ runId: run.id })}
              >
                <TableCell className="pl-4">{formatTimestamp(run.startedAt)}</TableCell>
                <TableCell>
                  <span className="font-medium">{run.suiteName}</span>
                  <span className="block text-xs text-muted-foreground">{run.environment}</span>
                </TableCell>
                <TableCell>{run.release ?? "Unreleased"}</TableCell>
                <TableCell>
                  <RunStatus status={run.status} />
                </TableCell>
                <TableCell>{formatNumber(run.evaluatedCases)}</TableCell>
                <TableCell>
                  {run.results > 0 ? `${(run.passRate * 100).toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="pr-4">
                  {run.durationMs === null ? "—" : `${run.durationMs} ms`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : state.runs.isLoading ? (
        <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
          Loading runs…
        </div>
      ) : (
        <EmptyState
          icon={<Flask />}
          title="No evaluation runs"
          text="Upgrade @anvia/lens and execute runEvalSuite() to create the first run."
        />
      )}
    </Card>
  );
}

function RunDetail({ state }: { state: EvaluationWorkspaceState }) {
  const detail = state.runDetail.data;
  if (state.runDetail.error) return <ErrorAlert error={state.runDetail.error} />;
  if (!detail) return <div className="text-sm text-muted-foreground">Loading run…</div>;
  return (
    <div className="grid gap-4">
      <Button
        className="w-fit"
        variant="ghost"
        onClick={() => state.setFilters({ runId: undefined })}
      >
        <ArrowLeft /> Back to runs
      </Button>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Status" value={detail.run.status} />
        <SummaryCard label="Pass rate" value={`${(detail.run.passRate * 100).toFixed(1)}%`} />
        <SummaryCard label="Cases" value={formatNumber(detail.run.evaluatedCases)} />
        <SummaryCard label="Release" value={detail.run.release ?? "Unreleased"} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{detail.run.suiteName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Run ID:</span> {detail.run.id}
          </p>
          <p>
            <span className="text-muted-foreground">Environment:</span> {detail.run.environment}
          </p>
          <p>
            <span className="text-muted-foreground">Dataset:</span> {detail.run.datasetName ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Dataset version:</span>{" "}
            {detail.run.datasetVersion ?? "—"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Metric</TableHead>
              <TableHead>Results</TableHead>
              <TableHead>Pass rate</TableHead>
              <TableHead className="pr-4">Average</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.metrics.map((metric) => (
              <TableRow key={metric.metricName}>
                <TableCell className="pl-4 font-medium">{metric.metricName}</TableCell>
                <TableCell>{metric.results}</TableCell>
                <TableCell>{(metric.passRate * 100).toFixed(1)}%</TableCell>
                <TableCell className="pr-4">
                  {metric.averageNumericValue?.toFixed(3) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        {detail.results.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Case</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="pr-4">Trace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="pl-4">{result.caseId ?? "—"}</TableCell>
                  <TableCell className="font-medium">{result.metricName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{result.outcome}</Badge>
                  </TableCell>
                  <TableCell>{result.numericValue ?? result.categoricalValue ?? "—"}</TableCell>
                  <TableCell className="pr-4">
                    <TraceLink projectId={state.project.id} traceId={result.traceId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">
            This run has no evaluation results.
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function CompareView({ state }: { state: EvaluationWorkspaceState }) {
  const allRuns = state.selectorRuns.data?.items ?? [];
  const candidate = allRuns.find((run) => run.id === state.filters.candidateRunId);
  const baselineRuns = candidate
    ? allRuns.filter(
        (run) =>
          run.id !== candidate.id &&
          run.suiteName === candidate.suiteName &&
          run.environment === candidate.environment,
      )
    : allRuns;
  const compatibleGates = (state.gates.data?.items ?? []).filter(
    (gate) =>
      candidate &&
      gate.suiteName === candidate.suiteName &&
      gate.environment === candidate.environment,
  );
  const comparison = state.comparison.data;
  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3">
          <RunSelect
            label="Candidate"
            value={state.filters.candidateRunId}
            runs={allRuns}
            onChange={(candidateRunId) =>
              state.setFilters({ candidateRunId, baselineRunId: undefined, gateId: undefined })
            }
          />
          <RunSelect
            label="Baseline"
            value={state.filters.baselineRunId}
            runs={baselineRuns}
            onChange={(baselineRunId) => state.setFilters({ baselineRunId })}
          />
          <Field>
            <FieldLabel>Quality gate</FieldLabel>
            <NativeSelect
              value={state.filters.gateId ?? ""}
              onChange={(event) => state.setFilters({ gateId: event.target.value || undefined })}
            >
              <NativeSelectOption value="">No gate</NativeSelectOption>
              {compatibleGates.map((gate) => (
                <NativeSelectOption key={gate.id} value={gate.id}>
                  {gate.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>
      {state.comparison.error ? <ErrorAlert error={state.comparison.error} /> : null}
      {!state.filters.candidateRunId || !state.filters.baselineRunId ? (
        <EmptyState
          icon={<Flask />}
          title="Choose two completed runs"
          text="Candidate and baseline must use the same suite and environment."
        />
      ) : !comparison ? (
        <div className="text-sm text-muted-foreground">Loading comparison…</div>
      ) : (
        <>
          {comparison.warnings.map((warning) => (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm" key={warning}>
              {warning}
            </div>
          ))}
          {comparison.gate ? (
            <GateVerdict
              gate={comparison.gate.gate}
              verdict={comparison.gate.verdict}
              messages={comparison.gate.rules.map((rule) => rule.message)}
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <DeltaCard label="Pass rate" value={comparison.passRate} percent />
            <DeltaCard label="P95 latency" value={comparison.p95LatencyMs} suffix=" ms" />
            <DeltaCard label="Average tokens" value={comparison.averageTotalTokens} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Metric comparison</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Metric</TableHead>
                  <TableHead>Candidate pass</TableHead>
                  <TableHead>Baseline pass</TableHead>
                  <TableHead>Pass delta</TableHead>
                  <TableHead className="pr-4">Score delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.metrics.map((metric) => (
                  <TableRow key={metric.metricName}>
                    <TableCell className="pl-4 font-medium">{metric.metricName}</TableCell>
                    <TableCell>
                      {metric.candidate ? `${(metric.candidate.passRate * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {metric.baseline ? `${(metric.baseline.passRate * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {metric.passRateDelta === null
                        ? "—"
                        : `${(metric.passRateDelta * 100).toFixed(1)} pp`}
                    </TableCell>
                    <TableCell className="pr-4">
                      {metric.averageScoreDelta?.toFixed(3) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Changed cases</CardTitle>
            </CardHeader>
            {comparison.caseChanges.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Case</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Candidate trace</TableHead>
                    <TableHead className="pr-4">Baseline trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.caseChanges.map((item) => (
                    <TableRow key={`${item.caseId}-${item.metricName}`}>
                      <TableCell className="pl-4">{item.caseId}</TableCell>
                      <TableCell>{item.metricName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.classification.replaceAll("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <TraceLink projectId={state.project.id} traceId={item.candidateTraceId} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <TraceLink projectId={state.project.id} traceId={item.baselineTraceId} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <CardContent className="text-sm text-muted-foreground">
                No outcome regressions or improvements.
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TraceLink(props: { projectId: string; traceId: string | null }) {
  if (!props.traceId) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      className="font-mono text-primary hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: props.projectId, traceId: props.traceId }}
    >
      {shortId(props.traceId)}
    </Link>
  );
}

function GatesView({ state }: { state: EvaluationWorkspaceState }) {
  const [editing, setEditing] = useState<QualityGate | "new" | null>(null);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  return (
    <div className="grid gap-4">
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
    </div>
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

function RunSelect(props: {
  label: string;
  value?: string;
  runs: EvaluationRunSummary[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <NativeSelect
        value={props.value ?? ""}
        onChange={(event) => props.onChange(event.target.value || undefined)}
      >
        <NativeSelectOption value="">Select a run</NativeSelectOption>
        {props.runs.map((run) => (
          <NativeSelectOption key={run.id} value={run.id}>
            {run.release ?? "Unreleased"} · {run.suiteName} · {formatTimestamp(run.startedAt)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
function RunStatus({ status }: { status: EvaluationRunSummary["status"] }) {
  return (
    <Badge
      variant={
        status === "completed" ? "secondary" : status === "failed" ? "destructive" : "outline"
      }
    >
      {status}
    </Badge>
  );
}
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
function DeltaCard({
  label,
  value,
  suffix = "",
  percent = false,
}: {
  label: string;
  value: { candidate: number | null; baseline: number | null; delta: number | null };
  suffix?: string;
  percent?: boolean;
}) {
  const render = (item: number | null) =>
    item === null ? "—" : percent ? `${(item * 100).toFixed(1)}%` : `${item.toFixed(1)}${suffix}`;
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{render(value.candidate)}</p>
        <p className="text-xs text-muted-foreground">
          Baseline {render(value.baseline)} · Δ {render(value.delta)}
        </p>
      </CardContent>
    </Card>
  );
}
function GateVerdict({
  gate,
  verdict,
  messages,
}: {
  gate: QualityGate;
  verdict: string;
  messages: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{gate.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{messages.join(" · ")}</p>
        </div>
        <Badge
          variant={
            verdict === "pass" ? "secondary" : verdict === "fail" ? "destructive" : "outline"
          }
        >
          {verdict.replaceAll("_", " ")}
        </Badge>
      </CardHeader>
    </Card>
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
