import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { cn } from "@lens/ui/lib/utils";
import { ArrowLeft, Flask } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { FullPageMessage } from "../../../components/full-page-message";
import type { EvaluationRunDetailState } from "../hooks/use-evaluation-runs";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { HeaderMetric } from "./header-metric";

export function EvaluationRunDetailView({ state }: { state: EvaluationRunDetailState }) {
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Flask />} text="Loading evaluation run" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<Flask />} text="Evaluation run not found" contained />;
  const detail = state.detail.data;
  const run = detail.run;
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
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
                {detail.metrics.map((metric) => (
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
                        {result.traceId ? (
                          <Link
                            className="font-mono text-primary hover:underline"
                            to="/$projectId/traces/$traceId"
                            params={{ projectId: state.project.id, traceId: result.traceId }}
                          >
                            {shortId(result.traceId)}
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
        </div>
      </ScrollArea>
    </main>
  );
}
