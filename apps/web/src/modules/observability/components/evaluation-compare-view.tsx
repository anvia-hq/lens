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
import { SelectField } from "@lens/ui/components/select";
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
import {
  ExternalLink as ArrowSquareOut,
  FlaskConical as Flask,
  Danger as WarningCircle,
} from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { EvaluationCompareState } from "../hooks/use-evaluation-workspace";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
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
            label="Run to check"
            value={state.filters.candidateRunId}
            runs={allRuns}
            onChange={(candidateRunId) =>
              state.setFilters({ candidateRunId, baselineRunId: undefined, gateId: undefined })
            }
          />
          <RunSelect
            disabled={!candidate}
            label="Compare against"
            value={state.filters.baselineRunId}
            runs={baselineRuns}
            onChange={(baselineRunId) => state.setFilters({ baselineRunId })}
          />
          <Field>
            <FieldLabel>Quality gate</FieldLabel>
            <SelectField
              disabled={!candidate}
              value={state.filters.gateId ?? ""}
              onValueChange={(value) => state.setFilters({ gateId: value || undefined })}
              options={[
                { value: "", label: "No gate" },
                ...compatibleGates.map((gate) => ({ value: gate.id, label: gate.name })),
              ]}
            />
          </Field>
        </CardContent>
      </Card>

      {selectorError ? <ErrorAlert error={selectorError} /> : null}
      {state.comparison.error ? <ErrorAlert error={state.comparison.error} /> : null}

      {!state.filters.candidateRunId || !state.filters.baselineRunId ? (
        <EmptyState
          icon={<Flask />}
          title={candidate ? "Choose a run to compare against" : "Choose a run to check"}
          text="Both runs must use the same suite and environment."
        />
      ) : !comparison ? (
        <div className="text-base text-muted-foreground">Loading comparison…</div>
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
      <ComparisonSummary comparison={comparison} projectId={props.projectId} />
      {comparison.gate ? <GateChecks evaluation={comparison.gate} /> : null}
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
      <SelectField
        disabled={props.disabled}
        value={props.value ?? ""}
        onValueChange={(value) => props.onChange(value || undefined)}
        options={[
          { value: "", label: "Select a run" },
          ...props.runs.map((run) => ({
            value: run.id,
            label: `${run.release ?? "Unreleased"} · ${run.suiteName} · ${formatTimestamp(run.startedAt)}`,
          })),
        ]}
      />
    </Field>
  );
}

/**
 * One card that answers "is the candidate better?": the gate verdict (when a gate is chosen),
 * what differs between the two runs, and the headline numbers as baseline → candidate.
 */
function ComparisonSummary(props: {
  comparison: NonNullable<EvaluationCompareState["comparison"]["data"]>;
  projectId: string;
}) {
  const { baseline, candidate, gate } = props.comparison;
  const differences = runDifferences(baseline, candidate);
  // Backend warnings that the differences above already explain are dropped.
  const otherWarnings = props.comparison.warnings.filter(
    (warning) => !/different (datasets|dataset versions|prompts|prompt versions)/i.test(warning),
  );
  return (
    <Card size="sm">
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {gate ? <EvaluationStatusBadge status={gate.verdict} /> : null}
          <p className="text-base font-medium">
            {candidate.release ?? "Unreleased"}
            <span className="font-normal text-muted-foreground"> compared with </span>
            {baseline.release ?? "Unreleased"}
          </p>
          <p className="text-sm text-muted-foreground">
            {candidate.suiteName}
            {candidate.datasetName ? ` · ${candidate.datasetName}` : ""} · {candidate.environment}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <RunLink label="Baseline run" projectId={props.projectId} run={baseline} />
            <RunLink label="Candidate run" projectId={props.projectId} run={candidate} />
          </div>
        </div>
        {differences.length || otherWarnings.length ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {differences.map((difference) => (
              <li key={difference.label} className="flex items-center gap-1.5">
                <WarningCircle className="size-3.5 text-status-warning" />
                {difference.label}
                <span className="text-foreground tabular-nums">
                  {difference.baseline} → {difference.candidate}
                </span>
              </li>
            ))}
            {otherWarnings.map((warning) => (
              <li key={warning} className="flex items-center gap-1.5">
                <WarningCircle className="size-3.5 text-status-warning" />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 lg:grid-cols-4">
          <SummaryStat label="Pass rate" value={props.comparison.passRate} kind="passRate" />
          <SummaryStat
            label="Evaluated cases"
            value={{
              baseline: baseline.evaluatedCases,
              candidate: candidate.evaluatedCases,
              delta: candidate.evaluatedCases - baseline.evaluatedCases,
              percentChange: null,
            }}
            kind="count"
          />
          <SummaryStat
            label="P95 trace duration"
            value={props.comparison.p95LatencyMs}
            kind="duration"
          />
          <SummaryStat
            label="Average tokens"
            value={props.comparison.averageTotalTokens}
            kind="tokens"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function runDifferences(baseline: EvaluationRunSummary, candidate: EvaluationRunSummary) {
  const pairs: Array<[string, string | null, string | null]> = [
    ["Dataset", baseline.datasetName, candidate.datasetName],
    ["Dataset version", baseline.datasetVersion, candidate.datasetVersion],
    ["Prompt", baseline.promptName, candidate.promptName],
    ["Prompt version", baseline.promptVersion, candidate.promptVersion],
  ];
  return pairs
    .filter(([, left, right]) => left !== right)
    .map(([label, left, right]) => ({
      label,
      baseline: left ?? "none",
      candidate: right ?? "none",
    }));
}

function RunLink(props: { label: string; projectId: string; run: EvaluationRunSummary }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      nativeButton={false}
      render={
        <Link
          to="/$projectId/evaluations/runs/$runId"
          params={{ projectId: props.projectId, runId: props.run.id }}
        />
      }
    >
      {props.label}
      <ArrowSquareOut />
    </Button>
  );
}

type StatKind = "passRate" | "count" | "duration" | "tokens";

function SummaryStat(props: { label: string; value: ComparisonValue; kind: StatKind }) {
  // Lower latency and fewer tokens are improvements; more cases and a higher pass rate are too.
  const higherIsBetter = props.kind === "passRate" || props.kind === "count";
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className="text-sm text-muted-foreground">
          {formatStat(props.value.baseline, props.kind)} →
        </span>
        <span className="text-xl font-medium">{formatStat(props.value.candidate, props.kind)}</span>
        <DeltaText value={props.value} kind={props.kind} higherIsBetter={higherIsBetter} />
      </dd>
    </div>
  );
}

function DeltaText(props: { value: ComparisonValue; kind: StatKind; higherIsBetter: boolean }) {
  const tone = comparisonDeltaTone(props.value, props.higherIsBetter);
  const delta = props.value.delta;
  if (delta === null) return null;
  const text =
    delta === 0
      ? "no change"
      : props.kind === "passRate"
        ? formatSigned(delta * 100, 1, " pp")
        : props.kind === "duration"
          ? `${delta > 0 ? "+" : "−"}${formatDuration(Math.abs(delta))}`
          : formatSigned(delta, 0);
  const percent =
    delta !== 0 && props.kind !== "passRate" && props.value.percentChange !== null
      ? ` (${formatSigned(props.value.percentChange, 1, "%")})`
      : "";
  return (
    <span
      className={cn(
        "text-xs font-medium",
        tone === "positive" && "text-status-success",
        tone === "negative" && "text-destructive",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {text}
      {percent}
    </span>
  );
}

function formatStat(value: number | null, kind: StatKind) {
  if (value === null) return "—";
  if (kind === "passRate") return `${(value * 100).toFixed(1)}%`;
  if (kind === "duration") return formatDuration(value);
  return formatNumber(Math.round(value));
}

export function comparisonDeltaTone(
  value: Pick<ComparisonValue, "delta">,
  higherIsBetter: boolean,
): DeltaTone {
  if (value.delta === null || value.delta === 0) return "neutral";
  const improved = higherIsBetter ? value.delta > 0 : value.delta < 0;
  return improved ? "positive" : "negative";
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
    <Card size="sm" className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-3">Metric</TableHead>
            <TableHead>Pass rate</TableHead>
            <TableHead className="pr-3">Average score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortMetricComparisons(metrics).map((metric) => (
            <TableRow key={metric.metricName}>
              <TableCell className="pl-3 font-medium">{metric.metricName}</TableCell>
              <TableCell>
                <ChangeCell
                  baseline={formatPassRate(metric.baseline?.passRate)}
                  candidate={formatPassRate(metric.candidate?.passRate)}
                  delta={metric.passRateDelta}
                  deltaText={
                    metric.passRateDelta === null
                      ? null
                      : formatSigned(metric.passRateDelta * 100, 1, " pp")
                  }
                />
              </TableCell>
              <TableCell className="pr-3">
                <ChangeCell
                  baseline={formatScore(metric.baseline?.averageNumericValue)}
                  candidate={formatScore(metric.candidate?.averageNumericValue)}
                  delta={metric.averageScoreDelta}
                  deltaText={
                    metric.averageScoreDelta === null
                      ? null
                      : formatSigned(metric.averageScoreDelta, 3)
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ChangeCell(props: {
  baseline: string;
  candidate: string;
  delta: number | null;
  deltaText: string | null;
}) {
  if (props.baseline === "—" && props.candidate === "—") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex items-baseline gap-2 tabular-nums">
      <span className="text-muted-foreground">{props.baseline} →</span>
      <span className="font-medium">{props.candidate}</span>
      {props.deltaText !== null && props.delta !== null && props.delta !== 0 ? (
        <span
          className={cn(
            "text-xs font-medium",
            props.delta > 0 ? "text-status-success" : "text-destructive",
          )}
        >
          {props.deltaText}
        </span>
      ) : null}
    </span>
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
    <Card size="sm" className="gap-0 overflow-hidden pb-0">
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
                    <TableHead className="pl-3">Case</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Baseline</TableHead>
                    <TableHead className="pr-3">Candidate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((change) => (
                    <TableRow key={`${change.caseId}-${change.metricName}`}>
                      <TableCell className="pl-3 font-medium">{change.caseId}</TableCell>
                      <TableCell>{change.metricName}</TableCell>
                      <TableCell>
                        <ChangeBadge classification={change.classification} />
                      </TableCell>
                      <TableCell>
                        <OutcomeValue
                          outcome={change.baselineOutcome}
                          value={change.baselineValue}
                          traceId={change.baselineTraceId}
                          projectId={props.projectId}
                        />
                      </TableCell>
                      <TableCell className="pr-3">
                        <OutcomeValue
                          outcome={change.candidateOutcome}
                          value={change.candidateValue}
                          traceId={change.candidateTraceId}
                          projectId={props.projectId}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : tab === item.value ? (
              <CardContent className="py-10 text-center text-base text-muted-foreground">
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
  traceId: string | null;
  projectId: string;
}) {
  if (props.outcome === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <EvaluationStatusBadge status={props.outcome} />
      <span className="max-w-32 truncate tabular-nums" title={String(props.value ?? "—")}>
        {String(props.value ?? "—")}
      </span>
      {props.traceId ? (
        <Link
          className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
          to="/$projectId/traces/$traceId"
          params={{ projectId: props.projectId, traceId: props.traceId }}
          title="Open trace"
        >
          {shortId(props.traceId)}
        </Link>
      ) : null}
    </div>
  );
}

function GateChecks({ evaluation }: { evaluation: QualityGateEvaluation }) {
  return (
    <Card size="sm" className="gap-0 overflow-hidden pb-0">
      <CardHeader className="flex items-center gap-2 border-b">
        <CardTitle>{evaluation.gate.name}</CardTitle>
        <EvaluationStatusBadge status={evaluation.verdict} />
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-3">Check</TableHead>
            <TableHead>Baseline</TableHead>
            <TableHead>Candidate</TableHead>
            <TableHead className="pr-3 text-right">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evaluation.rules.map((result) => (
            <TableRow key={`${JSON.stringify(result.rule)}-${result.message}`}>
              <TableCell className="pl-3" title={result.message}>
                {describeGateRule(result.rule)}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {formatGateValue(result.rule, result.baselineValue)}
              </TableCell>
              <TableCell className="tabular-nums font-medium">
                {formatGateValue(result.rule, result.candidateValue)}
              </TableCell>
              <TableCell className="pr-3 text-right">
                <EvaluationStatusBadge status={result.verdict} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

type GateRule = QualityGateEvaluation["rules"][number]["rule"];

/** Plain-language form of a gate rule, e.g. "safety_refusal pass rate ≥ 95%". */
export function describeGateRule(rule: GateRule): string {
  if (rule.type === "minimum_case_count")
    return `At least ${formatNumber(rule.value)} evaluated cases`;
  if (rule.type === "operational_regression") {
    const measure = rule.measure === "p95_latency_ms" ? "P95 trace duration" : "Average tokens";
    return `${measure} rises at most ${rule.maxIncreasePercent}%`;
  }
  const measure = rule.measure === "pass_rate" ? "pass rate" : "average score";
  const format = (value: number) =>
    rule.measure === "pass_rate" ? `${Math.round(value * 1000) / 10}%` : String(value);
  if (rule.type === "evaluation_threshold") {
    return `${rule.metricName} ${measure} ${rule.operator === "gte" ? "≥" : "≤"} ${format(rule.value)}`;
  }
  return `${rule.metricName} ${measure} ${rule.direction === "decrease" ? "drops" : "rises"} at most ${rule.measure === "pass_rate" ? `${Math.round(rule.maxAbsoluteChange * 1000) / 10} pp` : rule.maxAbsoluteChange}`;
}

function formatGateValue(rule: GateRule, value: number | null): string {
  if (value === null) return "—";
  if (rule.type === "minimum_case_count") return formatNumber(value);
  if (rule.type === "operational_regression") {
    return rule.measure === "p95_latency_ms"
      ? formatDuration(value)
      : formatNumber(Math.round(value));
  }
  return rule.measure === "pass_rate" ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
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
