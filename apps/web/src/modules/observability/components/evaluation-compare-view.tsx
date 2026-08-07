import type { EvaluationRunSummary, QualityGate } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
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
import { Flask } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { EvaluationCompareState } from "../hooks/use-evaluation-workspace";
import { formatTimestamp, shortId } from "../utils/trace-detail";

export function EvaluationCompareView({ state }: { state: EvaluationCompareState }) {
  const allRuns = state.runs.data?.items ?? [];
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
    <Page
      title="Compare evaluation runs"
      description="Measure release quality and apply a saved gate"
    >
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
    </Page>
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

function DeltaCard(props: {
  label: string;
  value: { candidate: number | null; baseline: number | null; delta: number | null };
  suffix?: string;
  percent?: boolean;
}) {
  const render = (item: number | null) =>
    item === null
      ? "—"
      : props.percent
        ? `${(item * 100).toFixed(1)}%`
        : `${item.toFixed(1)}${props.suffix ?? ""}`;
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{props.label}</p>
        <p className="mt-1 text-xl font-semibold">{render(props.value.candidate)}</p>
        <p className="text-xs text-muted-foreground">
          Baseline {render(props.value.baseline)} · Δ {render(props.value.delta)}
        </p>
      </CardContent>
    </Card>
  );
}

function GateVerdict(props: { gate: QualityGate; verdict: string; messages: string[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{props.gate.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{props.messages.join(" · ")}</p>
        </div>
        <Badge
          variant={
            props.verdict === "pass"
              ? "secondary"
              : props.verdict === "fail"
                ? "destructive"
                : "outline"
          }
        >
          {props.verdict.replaceAll("_", " ")}
        </Badge>
      </CardHeader>
    </Card>
  );
}
