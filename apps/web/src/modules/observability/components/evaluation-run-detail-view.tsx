import type {
  EvaluationOutcome,
  EvaluationPayload,
  EvaluationPayloadStatus,
  EvaluationResult,
  EvaluationRunCaseDetail,
  EvaluationRunDetail,
  ManagedDatasetCaseInput,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { Input } from "@lens/ui/components/input";
import { SelectField } from "@lens/ui/components/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { cn } from "@lens/ui/lib/utils";
import {
  ArrowLeft,
  ArrowLeftRight as ArrowsLeftRight,
  ChevronLeft as CaretLeft,
  FlaskConical as Flask,
  Search,
  Trash,
} from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FullPageMessage } from "../../../components/full-page-message";
import type { EvaluationRunDetailState } from "../hooks/use-evaluation-runs";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { DataDeletionDialog } from "./data-deletion-dialog";
import { EvaluationRunStatusBadge } from "./evaluation-run-status-badge";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { HeaderMetric } from "./header-metric";
import { PayloadSection } from "./payload-section";

const unspecifiedCaseSearchValue = "__unspecified_case__";

export function EvaluationRunDetailView({ state }: { state: EvaluationRunDetailState }) {
  const isMobile = useIsMobile();
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Flask />} text="Loading evaluation run" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<Flask />} text="Evaluation run not found" contained />;
  const detail = state.detail.data;
  const run = detail.run;
  const orderedCases = sortEvaluationCases(detail.cases);
  const selected = selectEvaluationCase(orderedCases, state.search.case, isMobile);
  const selectedCaseMissing = state.search.case !== undefined && selected === undefined;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              render={
                <Link
                  to="/$projectId/evaluations/runs"
                  params={{ projectId: state.project.id }}
                  search={{ range: "24h" }}
                />
              }
            >
              <ArrowLeft />
              <span className="sr-only">Back to runs</span>
            </Button>
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="truncate font-heading text-xl font-medium tracking-tight">
                  {run.suiteName}
                </h1>
                <EvaluationRunStatusBadge status={run.status} />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{formatTimestamp(run.startedAt)}</span>
                {run.durationMs !== null ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(run.durationMs)}</span>
                  </>
                ) : null}
                <span aria-hidden="true">·</span>
                <span className="font-mono" title={run.id}>
                  {shortId(run.id)}
                </span>
                <Badge variant="outline">{run.environment}</Badge>
                <Badge variant="outline">{run.serviceName}</Badge>
                {run.release ? <Badge variant="secondary">Release {run.release}</Badge> : null}
                {run.datasetName ? (
                  <Badge variant="secondary">
                    Dataset {run.datasetName}
                    {run.datasetVersion ? `@${run.datasetVersion}` : ""}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {run.status === "completed" ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/$projectId/evaluations/compare"
                    params={{ projectId: state.project.id }}
                    search={{ candidateRunId: run.id }}
                  />
                }
              >
                <ArrowsLeftRight /> Compare
              </Button>
            ) : null}
            {state.project.role === "owner" || state.project.role === "admin" ? (
              <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash /> Delete
              </Button>
            ) : null}
          </div>
        </div>
        <dl className="mt-3 grid w-full grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 xl:grid-cols-8">
          <SummaryMetric
            label="Pass rate"
            value={run.results > 0 ? `${(run.passRate * 100).toFixed(1)}%` : "—"}
          />
          <SummaryMetric label="Failed results" value={formatNumber(run.actualFailed)} />
          <SummaryMetric
            label="Invalid / unknown"
            value={formatNumber(run.actualInvalid + run.actualUnknown)}
          />
          <SummaryMetric label="Cases" value={formatNumber(run.evaluatedCases)} />
          <SummaryMetric label="Results" value={formatNumber(run.results)} />
          <SummaryMetric
            label="P95 trace duration"
            value={run.p95LatencyMs === null ? "—" : formatDuration(run.p95LatencyMs)}
          />
          <SummaryMetric
            label="Average tokens"
            value={run.averageTotalTokens === null ? "—" : formatNumber(run.averageTotalTokens)}
          />
          <SummaryMetric
            label="Trace coverage"
            value={`${(run.traceCoverage * 100).toFixed(1)}%`}
          />
        </dl>
      </header>
      {selectedCaseMissing ? (
        <p className="shrink-0 border-b px-4 py-2 text-base text-muted-foreground" role="status">
          Selected case {state.search.case} is not on this result page. It may be on another page or
          no longer available. Choose a page or case to continue.
        </p>
      ) : null}
      {detail.resultsPage && (detail.resultsPage.pageCount > 1 || detail.resultsPage.page > 1) ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-base">
          <p className="text-muted-foreground">
            Results page {detail.resultsPage.page} of {detail.resultsPage.pageCount}. Case
            summaries, search, and filters apply to this page only; a case can span pages.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={state.resultPage <= 1}
              onClick={() => {
                state.setResultPage(state.resultPage - 1);
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={state.resultPage >= detail.resultsPage.pageCount}
              onClick={() => {
                state.setResultPage(state.resultPage + 1);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          selected ? (
            <CaseInspector
              key={caseSearchValue(selected)}
              item={selected}
              projectId={state.project.id}
              onBack={() => state.selectCase(null)}
            />
          ) : (
            <ScrollArea className="h-full">
              <div className="grid gap-4 p-4">
                <RunNavigation
                  detail={detail}
                  projectId={state.project.id}
                  selected={selected}
                  onSelect={state.selectCase}
                />
              </div>
            </ScrollArea>
          )
        ) : (
          <ResizablePanelGroup orientation="horizontal" id="evaluation-run-detail-layout">
            <ResizablePanel minSize={360} defaultSize="40" className="min-h-0 min-w-0">
              <ScrollArea className="h-full">
                <div className="grid gap-4 p-4">
                  <RunNavigation
                    detail={detail}
                    projectId={state.project.id}
                    selected={selected}
                    onSelect={state.selectCase}
                  />
                </div>
              </ScrollArea>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel minSize={420} defaultSize="60" className="min-h-0 min-w-0">
              {selected ? (
                <CaseInspector
                  key={caseSearchValue(selected)}
                  item={selected}
                  projectId={state.project.id}
                />
              ) : (
                <div className="grid h-full place-items-center text-base text-muted-foreground">
                  {selectedCaseMissing
                    ? "Select a case from this page to inspect it."
                    : "This result page has no evaluation cases."}
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <DataDeletionDialog
        entityType="evaluation_run"
        ids={deleteOpen ? [run.id] : []}
        pending={state.deletionPending}
        onOpenChange={setDeleteOpen}
        onConfirm={state.deleteRun}
      />
    </main>
  );
}

export function selectEvaluationCase(
  cases: EvaluationRunCaseDetail[],
  selectedCase: string | undefined,
  isMobile: boolean,
): EvaluationRunCaseDetail | undefined {
  if (selectedCase !== undefined) {
    return cases.find((item) => caseSearchValue(item) === selectedCase);
  }
  return isMobile ? undefined : cases[0];
}

function RunNavigation(props: {
  detail: EvaluationRunDetail;
  projectId: string;
  selected: EvaluationRunCaseDetail | undefined;
  onSelect: (caseId: string | null) => void;
}) {
  const [tab, setTab] = useState<"cases" | "metrics">("cases");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<EvaluationOutcome | "all">("all");
  const orderedCases = useMemo(() => sortEvaluationCases(props.detail.cases), [props.detail.cases]);
  const visibleCases = useMemo(
    () => filterEvaluationCases(orderedCases, search, outcome),
    [orderedCases, outcome, search],
  );
  const selected = props.selected;
  const onSelect = props.onSelect;

  useEffect(() => {
    if (!selected || visibleCases.includes(selected)) return;
    onSelect(visibleCases[0] ? caseSearchValue(visibleCases[0]) : null);
  }, [onSelect, selected, visibleCases]);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "cases" | "metrics")}
      className="gap-3"
    >
      <TabsList variant="line">
        <TabsTrigger value="cases">
          Cases <Badge variant="secondary">{props.detail.cases.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="metrics">
          Metrics <Badge variant="secondary">{props.detail.metrics.length}</Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cases" className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              aria-label="Search evaluation cases"
              placeholder="Search cases or metrics"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <SelectField
            className="h-8 w-36"
            aria-label="Filter case outcome"
            value={outcome}
            onValueChange={(value) => setOutcome(value as EvaluationOutcome | "all")}
            options={[
              { value: "all", label: "All outcomes" },
              { value: "fail", label: "Failed" },
              { value: "invalid", label: "Invalid" },
              { value: "unknown", label: "Unknown" },
              { value: "pass", label: "Passed" },
            ]}
          />
        </div>
        <Card className="overflow-hidden">
          {visibleCases.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Case</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Metrics</TableHead>
                  <TableHead className="pr-4">Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCases.map((item) => {
                  const traces = caseTraceIds(item);
                  const singleTraceId = traces.length === 1 ? traces[0] : undefined;
                  return (
                    <TableRow
                      key={item.caseId ?? "unspecified"}
                      className={cn("cursor-pointer", props.selected === item && "bg-muted/60")}
                      tabIndex={0}
                      onClick={() => props.onSelect(caseSearchValue(item))}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        props.onSelect(caseSearchValue(item));
                      }}
                    >
                      <TableCell className="max-w-52 truncate pl-4 font-medium">
                        {item.caseId ?? "Unspecified"}
                      </TableCell>
                      <TableCell>
                        <EvaluationStatusBadge status={item.outcome} />
                      </TableCell>
                      <TableCell>{formatNumber(item.results.length)}</TableCell>
                      <TableCell className="pr-4">
                        {traces.length > 1 ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatNumber(traces.length)} traces
                          </span>
                        ) : singleTraceId ? (
                          <Link
                            className="font-mono text-primary hover:underline"
                            to="/$projectId/traces/$traceId"
                            params={{ projectId: props.projectId, traceId: singleTraceId }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {shortId(singleTraceId)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="py-8 text-center text-base text-muted-foreground">
              {props.detail.cases.length
                ? "No cases match the current filters."
                : "This run has no evaluation results."}
            </CardContent>
          )}
        </Card>
      </TabsContent>
      <TabsContent value="metrics" className="grid gap-3">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Metric</TableHead>
                <TableHead>Results</TableHead>
                <TableHead>Passed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Pass rate</TableHead>
                <TableHead className="pr-4">Average</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.detail.metrics.map((metric) => (
                <TableRow key={metric.metricName}>
                  <TableCell className="pl-4 font-medium">{metric.metricName}</TableCell>
                  <TableCell>{formatNumber(metric.results)}</TableCell>
                  <TableCell>{formatNumber(metric.passed)}</TableCell>
                  <TableCell>{formatNumber(metric.failed)}</TableCell>
                  <TableCell>{(metric.passRate * 100).toFixed(1)}%</TableCell>
                  <TableCell className="pr-4">
                    {metric.averageNumericValue?.toFixed(3) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <RunDetails detail={props.detail} />
      </TabsContent>
    </Tabs>
  );
}

const outcomePriority: Record<EvaluationOutcome, number> = {
  fail: 0,
  invalid: 1,
  unknown: 2,
  pass: 3,
};

export function sortEvaluationCases(cases: EvaluationRunCaseDetail[]) {
  return cases
    .map((item, index) => ({ item, index }))
    .toSorted(
      (left, right) =>
        outcomePriority[left.item.outcome] - outcomePriority[right.item.outcome] ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

export function filterEvaluationCases(
  cases: EvaluationRunCaseDetail[],
  search: string,
  outcome: EvaluationOutcome | "all",
) {
  const query = search.trim().toLocaleLowerCase();
  return cases.filter(
    (item) =>
      (outcome === "all" || item.outcome === outcome) &&
      (query.length === 0 ||
        item.caseId?.toLocaleLowerCase().includes(query) ||
        item.results.some((result) => result.metricName.toLocaleLowerCase().includes(query))),
  );
}

function caseSearchValue(item: EvaluationRunCaseDetail) {
  return item.caseId ?? unspecifiedCaseSearchValue;
}

function RunDetails({ detail }: { detail: EvaluationRunDetail }) {
  const run = detail.run;
  const rows = [
    ["Run ID", run.id],
    ["Started", formatTimestamp(run.startedAt)],
    ["Completed", run.completedAt ? formatTimestamp(run.completedAt) : "—"],
    ["Service", run.serviceName],
    ["Environment", run.environment],
    ["Release", run.release ?? "Unreleased"],
    ["Dataset", run.datasetName ?? "—"],
    ["Dataset version", run.datasetVersion ?? "—"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Run details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div className="grid gap-0.5" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cn("text-base", label === "Run ID" && "break-all font-mono text-xs")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {Object.keys(run.metadata).length ? (
          <div className="grid gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">Metadata</h3>
            <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap">
              {JSON.stringify(run.metadata, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function formatMetricExplanation(
  result: Pick<EvaluationResult, "explanation" | "metricModel">,
): string {
  if (result.explanation !== null && result.explanation.trim().length > 0) {
    return result.explanation;
  }
  return result.metricModel ? "No judge explanation was provided." : "No explanation provided.";
}

export function caseTraceIds(item: EvaluationRunCaseDetail): string[] {
  if (item.traceIds !== undefined) return item.traceIds;
  const fromResults = item.results
    .map((result) => result.traceId)
    .filter((traceId): traceId is string => traceId !== null && traceId !== undefined);
  if (fromResults.length > 0) return Array.from(new Set(fromResults));
  return item.traceId ? [item.traceId] : [];
}

function maxTrialNumber(item: EvaluationRunCaseDetail): number {
  return (item.trials ?? []).reduce((highest, trial) => Math.max(highest, trial.trial), 0);
}

function isMultiTrialCase(item: EvaluationRunCaseDetail): boolean {
  const trials = item.trials ?? [];
  return (
    trials.length > 0 &&
    (trials.length > 1 || (item.trialCount ?? 0) > 1 || maxTrialNumber(item) > 1)
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function aggregateResultOutcome(results: EvaluationResult[]): EvaluationOutcome {
  const outcomes = new Set(results.map((result) => result.outcome));
  return outcomes.has("fail")
    ? "fail"
    : outcomes.has("invalid")
      ? "invalid"
      : outcomes.has("unknown")
        ? "unknown"
        : "pass";
}

function CaseInspector(props: {
  item: EvaluationRunCaseDetail;
  projectId: string;
  onBack?: () => void;
}) {
  const item = props.item;
  const trials = item.trials ?? [];
  const multiTrial = isMultiTrialCase(item);
  const totalTrials = multiTrial
    ? Math.max(item.trialCount ?? 0, maxTrialNumber(item), trials.length)
    : 0;
  const passedTrials = multiTrial
    ? (item.passedTrials ?? trials.filter((trial) => trial.outcome === "pass").length)
    : 0;
  const cachedTrialCount = multiTrial ? trials.filter((trial) => trial.cached).length : 0;
  const caseCached = item.cached ?? item.results.some((result) => result.cached === true);
  const untrialedResults = multiTrial ? item.results.filter((result) => result.trial === null) : [];
  const untrialedPayloadItem =
    untrialedResults.find((result) => result.payload !== null) ?? untrialedResults[0];
  const untrialedPayloads = untrialedResults.flatMap((result) =>
    result.payload === null ? [] : [stableJson(result.payload)],
  );
  const untrialedPayloadConsistent = new Set(untrialedPayloads).size <= 1;
  const untrialedTraceId =
    untrialedResults.find((result) => result.traceId !== null)?.traceId ?? null;
  const untrialedOutcome =
    untrialedResults.length > 0 ? aggregateResultOutcome(untrialedResults) : "pass";

  const [selectedTrial, setSelectedTrial] = useState<string>(() => String(trials[0]?.trial ?? 1));
  const validTabValues = new Set(trials.map((trial) => String(trial.trial)));
  if (untrialedResults.length > 0) validTabValues.add("case");
  const activeTrialValue = validTabValues.has(selectedTrial)
    ? selectedTrial
    : String(trials[0]?.trial ?? 1);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Evaluation case">
      <header className="shrink-0 border-b px-4 py-4 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {props.onBack ? (
              <Button size="icon-sm" variant="ghost" onClick={props.onBack}>
                <CaretLeft />
                <span className="sr-only">Back to cases</span>
              </Button>
            ) : null}
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold">
                  {item.caseId ?? "Unspecified case"}
                </h2>
                <EvaluationStatusBadge status={item.outcome} />
                {multiTrial ? (
                  <>
                    <Badge variant="secondary">
                      {passedTrials}/{totalTrials} trials passed
                    </Badge>
                    {passedTrials > 0 ? <Badge variant="outline">pass@{totalTrials}</Badge> : null}
                    {cachedTrialCount === trials.length && cachedTrialCount > 0 ? (
                      <Badge variant="secondary">Cached</Badge>
                    ) : cachedTrialCount > 0 ? (
                      <Badge variant="secondary">
                        {cachedTrialCount}/{totalTrials} cached
                      </Badge>
                    ) : null}
                  </>
                ) : caseCached ? (
                  <Badge variant="secondary">Cached</Badge>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                {multiTrial
                  ? `${trials.length} trial${trials.length === 1 ? "" : "s"} · ${item.results.length} metric result${item.results.length === 1 ? "" : "s"}`
                  : `${item.results.length} metric result${item.results.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
          {!multiTrial && item.traceId ? (
            <Button
              className="shrink-0"
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/$projectId/traces/$traceId"
                  params={{ projectId: props.projectId, traceId: item.traceId }}
                />
              }
            >
              Open trace {shortId(item.traceId)}
            </Button>
          ) : null}
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-4 md:p-6">
          {multiTrial ? (
            <Tabs
              value={activeTrialValue}
              onValueChange={(value) => setSelectedTrial(String(value))}
              className="gap-4"
            >
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start gap-2 border-b pb-1"
              >
                {trials.map((trial) => (
                  <TabsTrigger
                    key={trial.trial}
                    value={String(trial.trial)}
                    className="flex-none px-2.5 py-1"
                  >
                    <TrialOutcomeDot outcome={trial.outcome} />
                    <span>
                      Trial {trial.trial} / {totalTrials}
                    </span>
                    <span className="sr-only"> ({trial.outcome})</span>
                  </TabsTrigger>
                ))}
                {untrialedResults.length > 0 ? (
                  <TabsTrigger value="case" className="flex-none px-2.5 py-1">
                    <TrialOutcomeDot outcome={untrialedOutcome} />
                    <span>Case-level</span>
                    <span className="sr-only"> ({untrialedOutcome})</span>
                  </TabsTrigger>
                ) : null}
              </TabsList>
              {trials.map((trial) => (
                <TabsContent key={trial.trial} value={String(trial.trial)} className="grid gap-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        Trial {trial.trial} / {totalTrials}
                      </span>
                      <EvaluationStatusBadge status={trial.outcome} />
                      {trial.cached ? <Badge variant="secondary">Cached</Badge> : null}
                    </div>
                    {trial.traceId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to="/$projectId/traces/$traceId"
                            params={{ projectId: props.projectId, traceId: trial.traceId }}
                          />
                        }
                      >
                        Open trace {shortId(trial.traceId)}
                      </Button>
                    ) : null}
                  </div>
                  <CaseResultContent
                    results={trial.results}
                    payload={trial.payload}
                    payloadStatus={trial.payloadStatus}
                    payloadConsistent={trial.payloadConsistent}
                    datasetItem={item.datasetItem}
                  />
                </TabsContent>
              ))}
              {untrialedResults.length > 0 ? (
                <TabsContent value="case" className="grid gap-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Case-level results</span>
                      <EvaluationStatusBadge status={untrialedOutcome} />
                    </div>
                    {untrialedTraceId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to="/$projectId/traces/$traceId"
                            params={{ projectId: props.projectId, traceId: untrialedTraceId }}
                          />
                        }
                      >
                        Open trace {shortId(untrialedTraceId)}
                      </Button>
                    ) : null}
                  </div>
                  <CaseResultContent
                    results={untrialedResults}
                    payload={untrialedPayloadItem?.payload ?? null}
                    payloadStatus={untrialedPayloadItem?.payloadStatus ?? "not_requested"}
                    payloadConsistent={untrialedPayloadConsistent}
                    datasetItem={item.datasetItem}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          ) : (
            <CaseResultContent
              results={item.results}
              payload={item.payload}
              payloadStatus={item.payloadStatus}
              payloadConsistent={item.payloadConsistent}
              datasetItem={item.datasetItem}
            />
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function TrialOutcomeDot({ outcome }: { outcome: EvaluationOutcome }) {
  const tone =
    outcome === "pass"
      ? "bg-status-success"
      : outcome === "fail"
        ? "bg-status-error"
        : outcome === "invalid"
          ? "bg-status-warning"
          : "bg-muted-foreground";
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", tone)} />;
}

function CaseResultContent(props: {
  results: EvaluationResult[];
  payload: EvaluationPayload | null;
  payloadStatus: EvaluationPayloadStatus;
  payloadConsistent: boolean;
  datasetItem?: ManagedDatasetCaseInput | null;
}) {
  const definition = props.datasetItem;
  const input = props.payload?.input ?? definition?.input;
  const expected = props.payload?.expected ?? definition?.expected;
  const context = props.payload?.context ?? definition?.context;
  const retrievalContext = props.payload?.retrievalContext ?? definition?.retrievalContext;

  return (
    <>
      <section className="grid gap-3">
        <h3 className="text-base font-semibold">Metric results</h3>
        {props.results.length ? (
          props.results
            .toSorted(
              (left, right) => outcomePriority[left.outcome] - outcomePriority[right.outcome],
            )
            .map((result) => (
              <Card key={result.id} size="sm">
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{result.metricName}</CardTitle>
                    {result.metricModel ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {result.metricProvider
                          ? `${result.metricProvider}/${result.metricModel}`
                          : result.metricModel}
                      </span>
                    ) : null}
                  </div>
                  <EvaluationStatusBadge status={result.outcome} />
                </CardHeader>
                <CardContent className="grid gap-2 text-base">
                  <div>
                    <span className="text-muted-foreground">Value:</span>{" "}
                    {result.numericValue ?? result.categoricalValue ?? "—"}
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {formatMetricExplanation(result)}
                  </p>
                </CardContent>
              </Card>
            ))
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-base text-muted-foreground">
            This case has no metric results.
          </div>
        )}
      </section>
      {!props.payloadConsistent ? (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-base">
          Metrics in this case reported inconsistent payloads.
        </div>
      ) : null}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">Payload</h3>
        </div>
        {input === undefined ? (
          <div className="rounded-lg border border-dashed p-4 text-base text-muted-foreground">
            {payloadStatusMessage(props.payloadStatus)}
          </div>
        ) : (
          <>
            {definition && props.payload === null ? (
              <Badge className="w-fit" variant="secondary">
                Managed dataset definition
              </Badge>
            ) : null}
            <PayloadSection title="Input" value={input} />
            <PayloadSection title="Expected" value={expected ?? null} />
            {props.payload === null ? (
              <div className="rounded-lg border border-dashed p-4 text-base text-muted-foreground">
                Target output was not captured for this run.
              </div>
            ) : (
              <PayloadSection title="Output" value={props.payload.output ?? null} />
            )}
            {context !== undefined ? <PayloadSection title="Context" value={context} /> : null}
            {retrievalContext !== undefined ? (
              <PayloadSection title="Retrieval context" value={retrievalContext} />
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

function SummaryMetric(props: { label: string; value: string }) {
  return (
    <div className="min-w-32 bg-background px-3 py-2.5">
      <HeaderMetric label={props.label} value={props.value} />
    </div>
  );
}

function payloadStatusMessage(status: EvaluationRunCaseDetail["payloadStatus"]): string {
  if (status === "size_limit") return "The evaluation payload exceeded the capture-size limit.";
  if (status === "serialization_error") return "The evaluation payload could not be serialized.";
  return "Evaluation payload capture was not enabled for this run.";
}
