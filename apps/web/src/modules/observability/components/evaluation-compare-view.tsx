import type {
  ComparisonValue,
  EvaluationCaseChange,
  EvaluationMetricComparison,
  EvaluationRunSummary,
  QualityGateEvaluation,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { Field, FieldLabel } from "@lens/ui/components/field";
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
import { cn } from "@lens/ui/lib/utils";
import { ArrowSquareOut, Flask, WarningCircle } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { EvaluationCompareState } from "../hooks/use-evaluation-workspace";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { EvaluationRunStatusBadge } from "./evaluation-run-status-badge";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { SemanticStatusBadge } from "./status-badge";

type ChangeTab = "regressions" | "improvements" | "removed" | "all";
type DeltaTone = "positive" | "negative" | "neutral";

export function EvaluationCompareView({ state }: { state: EvaluationCompareState }) {
  const listedRuns = state.runs.data?.items ?? [];
  const fallbackCandidate = state.candidateDetail.data?.run;
  const allRuns = includeFallbackCandidate(listedRuns, fallbackCandidate);
  const candidate = allRuns.find((run) => run.id === state.filters.candidateRunId);
  const baselineRuns = candidate
    ? allRuns.filter(
        (run) =>
          run.id !== candidate.id &&
          run.suiteName === candidate.suiteName &&
          run.environment === candidate.environment,
      )
    : [];
  const compatibleGates = (state.gates.data?.items ?? []).filter(
    (gate) =>
      candidate &&
      gate.suiteName === candidate.suiteName &&
      gate.environment === candidate.environment,
  );
  const comparison = state.comparison.data;
  const selectorError = state.runs.error ?? state.candidateDetail.error ?? state.gates.error;

  return (
    <Page
      title="Compare evaluation runs"
      description="Find regressions between a candidate and its baseline"
    >
      <Card size="sm">
        <CardContent className="grid gap-3 md:grid-cols-3">
          <RunSelect
            label="Candidate"
            value={state.filters.candidateRunId}
            runs={allRuns}
            onChange={(candidateRunId) =>
              state.setFilters({ candidateRunId, baselineRunId: undefined, gateId: undefined })
            }
          />
          <RunSelect
            disabled={!candidate}
            label="Baseline"
            value={state.filters.baselineRunId}
            runs={baselineRuns}
            onChange={(baselineRunId) => state.setFilters({ baselineRunId })}
          />
          <Field>
            <FieldLabel>Quality gate</FieldLabel>
            <NativeSelect
              disabled={!candidate}
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

      {selectorError ? <ErrorAlert error={selectorError} /> : null}
      {state.comparison.error ? <ErrorAlert error={state.comparison.error} /> : null}

      {!state.filters.candidateRunId || !state.filters.baselineRunId ? (
        <>
          {candidate ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <RunIdentityCard label="Candidate" run={candidate} projectId={state.project.id} />
            </div>
          ) : null}
          <EmptyState
            icon={<Flask />}
            title={candidate ? "Choose a baseline run" : "Choose a candidate run"}
            text="Runs must be completed and use the same suite and environment."
          />
        </>
      ) : !comparison ? (
        <div className="text-sm text-muted-foreground">Loading comparison…</div>
      ) : (
        <ComparisonResults comparison={comparison} projectId={state.project.id} />
      )}
    </Page>
  );
}

export function includeFallbackCandidate(
  listedRuns: EvaluationRunSummary[],
  fallbackCandidate: EvaluationRunSummary | undefined,
) {
  return fallbackCandidate && !listedRuns.some((run) => run.id === fallbackCandidate.id)
    ? [fallbackCandidate, ...listedRuns]
    : listedRuns;
}

function ComparisonResults(props: {
  comparison: NonNullable<EvaluationCompareState["comparison"]["data"]>;
  projectId: string;
}) {
  const comparison = props.comparison;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <RunIdentityCard label="Candidate" run={comparison.candidate} projectId={props.projectId} />
        <RunIdentityCard label="Baseline" run={comparison.baseline} projectId={props.projectId} />
      </div>

      {comparison.warnings.length ? (
        <div className="grid gap-2">
          {comparison.warnings.map((warning) => (
            <div
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
              key={warning}
            >
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <DeltaCard label="Pass rate" value={comparison.passRate} kind="passRate" />
        <DeltaCard label="P95 latency" value={comparison.p95LatencyMs} kind="duration" />
        <DeltaCard label="Average tokens" value={comparison.averageTotalTokens} kind="number" />
      </div>

      {comparison.gate ? <GateVerdict evaluation={comparison.gate} /> : null}

      <MetricComparisonTable metrics={comparison.metrics} />
      <CaseChanges
        changes={comparison.caseChanges}
        counts={comparison.caseChangeCounts}
        projectId={props.projectId}
      />
    </>
  );
}

function RunSelect(props: {
  disabled?: boolean;
  label: string;
  value?: string;
  runs: EvaluationRunSummary[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <NativeSelect
        disabled={props.disabled}
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

function RunIdentityCard(props: {
  label: "Candidate" | "Baseline";
  run: EvaluationRunSummary;
  projectId: string;
}) {
  const run = props.run;
  const candidate = props.label === "Candidate";
  return (
    <Card size="sm" className="relative">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b to-transparent",
          candidate ? "from-emerald-500/20 via-emerald-500/5" : "from-zinc-500/15 via-zinc-500/5",
        )}
      />
      <span
        className={cn(
          "absolute top-4 right-4 z-10 font-heading text-base font-semibold",
          candidate ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
        )}
      >
        {props.label}
      </span>
      <CardHeader className="relative pr-32">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{run.release ?? "Unreleased"}</CardTitle>
            <EvaluationRunStatusBadge status={run.status} />
            <Button
              size="icon-sm"
              variant="ghost"
              render={
                <Link
                  to="/$projectId/evaluations/runs/$runId"
                  params={{ projectId: props.projectId, runId: run.id }}
                />
              }
            >
              <ArrowSquareOut />
              <span className="sr-only">Open {props.label.toLocaleLowerCase()} run</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {run.suiteName} · {formatTimestamp(run.startedAt)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{run.environment}</Badge>
          <Badge variant="outline">{run.serviceName}</Badge>
          {run.datasetName ? (
            <Badge variant="secondary">
              {run.datasetName}
              {run.datasetVersion ? `@${run.datasetVersion}` : ""}
            </Badge>
          ) : null}
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t pt-3">
          <IdentityMetric
            label="Pass rate"
            value={run.results > 0 ? `${(run.passRate * 100).toFixed(1)}%` : "—"}
          />
          <IdentityMetric label="Cases" value={formatNumber(run.evaluatedCases)} />
          <IdentityMetric
            label="Trace coverage"
            value={`${(run.traceCoverage * 100).toFixed(1)}%`}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function IdentityMetric(props: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="font-medium tabular-nums">{props.value}</dd>
    </div>
  );
}

export function comparisonDeltaTone(
  value: Pick<ComparisonValue, "delta">,
  higherIsBetter: boolean,
): DeltaTone {
  if (value.delta === null || value.delta === 0) return "neutral";
  const improved = higherIsBetter ? value.delta > 0 : value.delta < 0;
  return improved ? "positive" : "negative";
}

function DeltaCard(props: {
  label: string;
  value: ComparisonValue;
  kind: "passRate" | "duration" | "number";
}) {
  const higherIsBetter = props.kind === "passRate";
  const tone = comparisonDeltaTone(props.value, higherIsBetter);
  const format = (value: number | null) => {
    if (value === null) return "—";
    if (props.kind === "passRate") return `${(value * 100).toFixed(1)}%`;
    if (props.kind === "duration") return formatDuration(value);
    return formatNumber(value);
  };
  const delta =
    props.value.delta === null
      ? "—"
      : props.kind === "passRate"
        ? formatSigned(props.value.delta * 100, 1, " pp")
        : props.kind === "duration"
          ? `${props.value.delta > 0 ? "+" : props.value.delta < 0 ? "−" : ""}${formatDuration(Math.abs(props.value.delta))}`
          : formatSigned(props.value.delta, 1);
  const percentChange =
    props.kind !== "passRate" && props.value.percentChange !== null
      ? ` · ${formatSigned(props.value.percentChange, 1, "%")}`
      : "";
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <p className="text-xs text-muted-foreground">{props.label}</p>
        <p className="text-xl font-semibold tabular-nums">{format(props.value.candidate)}</p>
        <p className="text-xs text-muted-foreground">Baseline {format(props.value.baseline)}</p>
        <p
          className={cn(
            "text-xs font-medium tabular-nums text-muted-foreground",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "negative" && "text-destructive",
          )}
        >
          Δ {delta}
          {percentChange}
        </p>
      </CardContent>
    </Card>
  );
}

export function sortMetricComparisons(metrics: EvaluationMetricComparison[]) {
  return metrics.toSorted((left, right) => {
    if (left.passRateDelta === null && right.passRateDelta === null) {
      return left.metricName.localeCompare(right.metricName);
    }
    if (left.passRateDelta === null) return 1;
    if (right.passRateDelta === null) return -1;
    return (
      left.passRateDelta - right.passRateDelta || left.metricName.localeCompare(right.metricName)
    );
  });
}

function MetricComparisonTable({ metrics }: { metrics: EvaluationMetricComparison[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Metric comparison</CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Metric</TableHead>
            <TableHead>Candidate pass</TableHead>
            <TableHead>Baseline pass</TableHead>
            <TableHead>Pass Δ</TableHead>
            <TableHead>Candidate average</TableHead>
            <TableHead>Baseline average</TableHead>
            <TableHead className="pr-4">Score Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortMetricComparisons(metrics).map((metric) => (
            <TableRow key={metric.metricName}>
              <TableCell className="pl-4 font-medium">{metric.metricName}</TableCell>
              <TableCell>{formatPassRate(metric.candidate?.passRate)}</TableCell>
              <TableCell>{formatPassRate(metric.baseline?.passRate)}</TableCell>
              <TableCell
                className={cn(
                  metric.passRateDelta !== null &&
                    metric.passRateDelta > 0 &&
                    "text-emerald-600 dark:text-emerald-400",
                  metric.passRateDelta !== null && metric.passRateDelta < 0 && "text-destructive",
                )}
              >
                {metric.passRateDelta === null
                  ? "—"
                  : formatSigned(metric.passRateDelta * 100, 1, " pp")}
              </TableCell>
              <TableCell>{formatScore(metric.candidate?.averageNumericValue)}</TableCell>
              <TableCell>{formatScore(metric.baseline?.averageNumericValue)}</TableCell>
              <TableCell className="pr-4">
                {metric.averageScoreDelta === null
                  ? "—"
                  : formatSigned(metric.averageScoreDelta, 3)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CaseChanges(props: {
  changes: EvaluationCaseChange[];
  counts: Record<EvaluationCaseChange["classification"], number>;
  projectId: string;
}) {
  const [tab, setTab] = useState<ChangeTab>("regressions");
  const visible = filterCaseChanges(props.changes, tab);
  const totalChanges = Object.values(props.counts).reduce((sum, count) => sum + count, 0);
  const tabs: Array<{ value: ChangeTab; label: string; count: number }> = [
    {
      value: "regressions",
      label: "Regressions",
      count: props.counts.regressed + props.counts.new_failure,
    },
    { value: "improvements", label: "Improvements", count: props.counts.improved },
    { value: "removed", label: "Removed", count: props.counts.removed },
    { value: "all", label: "All", count: totalChanges },
  ];
  return (
    <Card className="overflow-hidden">
      <Tabs value={tab} onValueChange={(value) => setTab(value as ChangeTab)} className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>Changed cases</CardTitle>
          {totalChanges > props.changes.length ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {formatNumber(props.changes.length)} of {formatNumber(totalChanges)}
              changes.
            </p>
          ) : null}
          <TabsList variant="line" className="mt-2">
            {tabs.map((item) => (
              <TabsTrigger value={item.value} key={item.value}>
                {item.label} <Badge variant="secondary">{item.count}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </CardHeader>
        {tabs.map((item) => (
          <TabsContent value={item.value} key={item.value}>
            {tab === item.value && visible.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Case</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Baseline</TableHead>
                    <TableHead>Candidate trace</TableHead>
                    <TableHead className="pr-4">Baseline trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((change) => (
                    <TableRow key={`${change.caseId}-${change.metricName}`}>
                      <TableCell className="pl-4 font-medium">{change.caseId}</TableCell>
                      <TableCell>{change.metricName}</TableCell>
                      <TableCell>
                        <ChangeBadge classification={change.classification} />
                      </TableCell>
                      <TableCell>
                        <OutcomeValue
                          outcome={change.candidateOutcome}
                          value={change.candidateValue}
                        />
                      </TableCell>
                      <TableCell>
                        <OutcomeValue
                          outcome={change.baselineOutcome}
                          value={change.baselineValue}
                        />
                      </TableCell>
                      <TableCell>
                        <TraceLink projectId={props.projectId} traceId={change.candidateTraceId} />
                      </TableCell>
                      <TableCell className="pr-4">
                        <TraceLink projectId={props.projectId} traceId={change.baselineTraceId} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : tab === item.value ? (
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {item.count > 0 && totalChanges > props.changes.length
                  ? `No ${item.label.toLocaleLowerCase()} are included in the first ${formatNumber(props.changes.length)} changes.`
                  : item.value === "regressions"
                    ? "No regressions detected."
                    : `No ${item.label.toLocaleLowerCase()} in this comparison.`}
              </CardContent>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

export function filterCaseChanges(changes: EvaluationCaseChange[], tab: ChangeTab) {
  if (tab === "regressions") {
    return changes.filter(
      (change) => change.classification === "regressed" || change.classification === "new_failure",
    );
  }
  if (tab === "improvements") {
    return changes.filter((change) => change.classification === "improved");
  }
  if (tab === "removed") return changes.filter((change) => change.classification === "removed");
  return changes;
}

function ChangeBadge({
  classification,
}: {
  classification: EvaluationCaseChange["classification"];
}) {
  const label = classification.replaceAll("_", " ");
  if (classification === "improved") {
    return <SemanticStatusBadge tone="success">{label}</SemanticStatusBadge>;
  }
  if (classification === "regressed" || classification === "new_failure") {
    return <SemanticStatusBadge tone="error">{label}</SemanticStatusBadge>;
  }
  return <SemanticStatusBadge tone="neutral">{label}</SemanticStatusBadge>;
}

function OutcomeValue(props: {
  outcome: EvaluationCaseChange["candidateOutcome"];
  value: EvaluationCaseChange["candidateValue"];
}) {
  if (props.outcome === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <EvaluationStatusBadge status={props.outcome} />
      <span className="max-w-32 truncate font-mono" title={String(props.value ?? "—")}>
        {String(props.value ?? "—")}
      </span>
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

function GateVerdict({ evaluation }: { evaluation: QualityGateEvaluation }) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{evaluation.gate.name}</CardTitle>
          <p className="text-xs text-muted-foreground">Quality gate verdict</p>
        </div>
        <EvaluationStatusBadge status={evaluation.verdict} />
      </CardHeader>
      <CardContent className="grid gap-2">
        {evaluation.rules.map((result) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
            key={`${JSON.stringify(result.rule)}-${result.message}`}
          >
            <p className="text-sm">{result.message}</p>
            <EvaluationStatusBadge status={result.verdict} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatPassRate(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toFixed(3);
}

function formatSigned(value: number, digits: number, suffix = "") {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${Math.abs(value).toFixed(digits)}${suffix}`;
}
