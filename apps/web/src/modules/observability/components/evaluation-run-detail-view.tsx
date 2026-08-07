import type { EvaluationRunCaseDetail, EvaluationRunDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
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
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { cn } from "@lens/ui/lib/utils";
import { ArrowLeft, Flask } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FullPageMessage } from "../../../components/full-page-message";
import type { EvaluationRunDetailState } from "../hooks/use-evaluation-runs";
import type { TracePayloadView } from "../types";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { HeaderMetric } from "./header-metric";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";

export function EvaluationRunDetailView({ state }: { state: EvaluationRunDetailState }) {
  const isMobile = useIsMobile();
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Flask />} text="Loading evaluation run" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<Flask />} text="Evaluation run not found" contained />;
  const detail = state.detail.data;
  const run = detail.run;
  const selected =
    detail.cases.find((item) => item.caseId === state.search.case) ?? detail.cases[0];
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background px-4 py-3">
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
              <Badge
                variant="outline"
                className={cn(
                  run.status === "completed" &&
                    "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                  run.status === "failed" && "border-destructive/40 text-destructive",
                )}
              >
                {run.status}
              </Badge>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatTimestamp(run.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono" title={run.id}>
                {shortId(run.id)}
              </span>
              <Badge variant="outline">{run.environment}</Badge>
              <Badge variant="outline">{run.serviceName}</Badge>
            </div>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderMetric
            label="Pass rate"
            value={run.results > 0 ? `${(run.passRate * 100).toFixed(1)}%` : "—"}
          />
          <HeaderMetric label="Cases" value={formatNumber(run.evaluatedCases)} />
          <HeaderMetric label="Results" value={formatNumber(run.results)} />
          <HeaderMetric
            label="Duration"
            value={run.durationMs === null ? "—" : formatDuration(run.durationMs)}
          />
          <HeaderMetric
            label="P95 latency"
            value={run.p95LatencyMs === null ? "—" : formatDuration(run.p95LatencyMs)}
          />
          <HeaderMetric
            label="Average tokens"
            value={run.averageTotalTokens === null ? "—" : formatNumber(run.averageTotalTokens)}
          />
        </dl>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {run.release ? <Badge variant="secondary">Release {run.release}</Badge> : null}
          {run.datasetName ? (
            <Badge variant="secondary">
              Dataset {run.datasetName}
              {run.datasetVersion ? `@${run.datasetVersion}` : ""}
            </Badge>
          ) : null}
          <Badge variant="outline">Trace coverage {(run.traceCoverage * 100).toFixed(1)}%</Badge>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          <ScrollArea className="h-full">
            <div className="grid gap-4 p-4">
              <RunNavigation
                detail={detail}
                projectId={state.project.id}
                selected={selected}
                onSelect={state.selectCase}
              />
              {selected ? <CaseInspector item={selected} projectId={state.project.id} /> : null}
            </div>
          </ScrollArea>
        ) : (
          <ResizablePanelGroup orientation="horizontal" id="evaluation-run-detail-layout">
            <ResizablePanel minSize={360} defaultSize="55" className="min-h-0 min-w-0">
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
            <ResizablePanel minSize={420} defaultSize="45" className="min-h-0 min-w-0">
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
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
        </CardHeader>
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
      <Card>
        <CardHeader>
          <CardTitle>Cases</CardTitle>
        </CardHeader>
        {props.detail.cases.length ? (
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
              {props.detail.cases.map((item) => (
                <TableRow
                  key={item.caseId ?? "unspecified"}
                  className={cn(
                    "cursor-pointer",
                    props.selected?.caseId === item.caseId && "bg-muted/60",
                  )}
                  tabIndex={0}
                  onClick={() => props.onSelect(item.caseId)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    props.onSelect(item.caseId);
                  }}
                >
                  <TableCell className="pl-4 font-medium">{item.caseId ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.outcome}</Badge>
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
                      "—"
                    )}
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
    </>
  );
}

function CaseInspector(props: { item: EvaluationRunCaseDetail; projectId: string }) {
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
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{item.caseId ?? "Unspecified case"}</h2>
              <Badge variant="outline">{item.outcome}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {item.results.length} metric result{item.results.length === 1 ? "" : "s"}
            </span>
          </div>
          <PayloadViewSwitch value={view} onChange={setView} />
        </div>
        {item.traceId ? (
          <Button
            className="mt-3"
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
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-4 md:p-6">
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
          {!item.payloadConsistent ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Metrics in this case reported inconsistent payloads.
            </div>
          ) : null}
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Metric results</h3>
            {item.results.map((result) => (
              <Card key={result.id}>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <CardTitle className="text-sm">{result.metricName}</CardTitle>
                  <Badge variant="outline">{result.outcome}</Badge>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div>Value: {result.numericValue ?? result.categoricalValue ?? "—"}</div>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {result.explanation ?? "No judge explanation was provided."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </ScrollArea>
    </section>
  );
}

function payloadStatusMessage(status: EvaluationRunCaseDetail["payloadStatus"]): string {
  if (status === "size_limit") return "The evaluation payload exceeded the capture-size limit.";
  if (status === "serialization_error") return "The evaluation payload could not be serialized.";
  return "Evaluation payload capture was not enabled for this run.";
}
