import type {
  EvaluationOutcome,
  EvaluationRunCaseDetail,
  EvaluationRunDetail,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
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
  ArrowsLeftRight,
  CaretLeft,
  Flask,
  MagnifyingGlass as Search,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FullPageMessage } from "../../../components/full-page-message";
import type { EvaluationRunDetailState } from "../hooks/use-evaluation-runs";
import type { TracePayloadView } from "../types";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { EvaluationRunStatusBadge } from "./evaluation-run-status-badge";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { HeaderMetric } from "./header-metric";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";

const unspecifiedCaseSearchValue = "__unspecified_case__";

export function EvaluationRunDetailView({ state }: { state: EvaluationRunDetailState }) {
  const isMobile = useIsMobile();
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Flask />} text="Loading evaluation run" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<Flask />} text="Evaluation run not found" contained />;
  const detail = state.detail.data;
  const run = detail.run;
  const orderedCases = sortEvaluationCases(detail.cases);
  const selectedFromSearch = orderedCases.find(
    (item) => caseSearchValue(item) === state.search.case,
  );
  const selected = isMobile ? selectedFromSearch : (selectedFromSearch ?? orderedCases[0]);
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
                <h1 className="truncate text-lg font-semibold tracking-tight">{run.suiteName}</h1>
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
          {run.status === "completed" ? (
            <Button
              className="shrink-0"
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
            label="P95 latency"
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
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          selected ? (
            <CaseInspector
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
                <CaseInspector item={selected} projectId={state.project.id} />
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  This run has no evaluation cases.
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </main>
  );
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
          <NativeSelect
            className="h-8 w-36"
            aria-label="Filter case outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as EvaluationOutcome | "all")}
          >
            <NativeSelectOption value="all">All outcomes</NativeSelectOption>
            <NativeSelectOption value="fail">Failed</NativeSelectOption>
            <NativeSelectOption value="invalid">Invalid</NativeSelectOption>
            <NativeSelectOption value="unknown">Unknown</NativeSelectOption>
            <NativeSelectOption value="pass">Passed</NativeSelectOption>
          </NativeSelect>
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
                {visibleCases.map((item) => (
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
                      {item.traceId ? (
                        <Link
                          className="font-mono text-primary hover:underline"
                          to="/$projectId/traces/$traceId"
                          params={{ projectId: props.projectId, traceId: item.traceId }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {shortId(item.traceId)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
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
              <dd className={cn("text-sm", label === "Run ID" && "break-all font-mono text-xs")}>
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

function CaseInspector(props: {
  item: EvaluationRunCaseDetail;
  projectId: string;
  onBack?: () => void;
}) {
  const [view, setView] = useState<TracePayloadView>("formatted");
  const item = props.item;
  const definition = item.datasetItem;
  const input = item.payload?.input ?? definition?.input;
  const expected = item.payload?.expected ?? definition?.expected;
  const context = item.payload?.context ?? definition?.context;
  const retrievalContext = item.payload?.retrievalContext ?? definition?.retrievalContext;
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
              </div>
              <span className="text-xs text-muted-foreground">
                {item.results.length} metric result{item.results.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          {item.traceId ? (
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
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Metric results</h3>
            {item.results.length ? (
              item.results
                .toSorted(
                  (left, right) => outcomePriority[left.outcome] - outcomePriority[right.outcome],
                )
                .map((result) => (
                  <Card key={result.id} size="sm">
                    <CardHeader className="flex-row items-center justify-between gap-3">
                      <CardTitle className="text-sm">{result.metricName}</CardTitle>
                      <EvaluationStatusBadge status={result.outcome} />
                    </CardHeader>
                    <CardContent className="grid gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Value:</span>{" "}
                        {result.numericValue ?? result.categoricalValue ?? "—"}
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {result.explanation ?? "No judge explanation was provided."}
                      </p>
                    </CardContent>
                  </Card>
                ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                This case has no metric results.
              </div>
            )}
          </section>
          {!item.payloadConsistent ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Metrics in this case reported inconsistent payloads.
            </div>
          ) : null}
          <section className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Payload</h3>
              <div className="ml-auto">
                <PayloadViewSwitch value={view} onChange={setView} />
              </div>
            </div>
            {input === undefined ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {payloadStatusMessage(item.payloadStatus)}
              </div>
            ) : (
              <>
                {definition && item.payload === null ? (
                  <Badge className="w-fit" variant="secondary">
                    Managed dataset definition
                  </Badge>
                ) : null}
                <PayloadSection title="Input" value={input} view={view} />
                <PayloadSection title="Expected" value={expected ?? null} view={view} />
                {item.payload === null ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Target output was not captured for this run.
                  </div>
                ) : (
                  <PayloadSection title="Output" value={item.payload.output ?? null} view={view} />
                )}
                {context !== undefined ? (
                  <PayloadSection title="Context" value={context} view={view} />
                ) : null}
                {retrievalContext !== undefined ? (
                  <PayloadSection title="Retrieval context" value={retrievalContext} view={view} />
                ) : null}
              </>
            )}
          </section>
        </div>
      </ScrollArea>
    </section>
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
