import type { EvaluationOutcome, EvaluationResult, TraceFacetValue } from "@lens/contracts";
import { evaluationOutcomes } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@lens/ui/components/chart";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@lens/ui/components/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { cn } from "@lens/ui/lib/utils";
import { CheckCircle, Flask, MagnifyingGlass } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { EvaluationsState } from "../hooks/use-evaluations";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { RangeSelector } from "./range-selector";

const chartConfig = {
  passed: { label: "Passed", color: "var(--chart-2)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  invalid: { label: "Invalid", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function EvaluationsView({
  state,
  navigation,
}: {
  state: EvaluationsState;
  navigation?: React.ReactNode;
}) {
  const {
    evaluations,
    facets,
    filters,
    overview,
    project,
    searchDraft,
    setFilters,
    setSearchDraft,
  } = state;
  const summary = overview.data?.summary;
  const error = evaluations.error ?? overview.error;

  return (
    <Page
      title="Evaluations"
      description="Quality results correlated with the traces and releases that produced them"
      action={<RangeSelector value={filters.range} onChange={(range) => setFilters({ range })} />}
    >
      {navigation}
      {error ? <ErrorAlert error={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Results" value={summary ? formatNumber(summary.results) : "—"} />
        <SummaryCard
          label="Pass rate"
          value={summary ? `${(summary.passRate * 100).toFixed(1)}%` : "—"}
        />
        <SummaryCard label="Failed" value={summary ? formatNumber(summary.failed) : "—"} />
        <SummaryCard
          label="Evaluated traces"
          value={summary ? formatNumber(summary.evaluatedTraces) : "—"}
        />
      </div>

      {overview.data && overview.data.summary.results > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quality trend</CardTitle>
              <CardDescription>Evaluation outcomes over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer className="h-64 w-full" config={chartConfig}>
                <BarChart data={overview.data.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) =>
                      new Date(String(value)).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: filters.range === "24h" ? "numeric" : undefined,
                      })
                    }
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="passed" stackId="outcomes" fill="var(--color-passed)" />
                  <Bar dataKey="failed" stackId="outcomes" fill="var(--color-failed)" />
                  <Bar
                    dataKey="invalid"
                    stackId="outcomes"
                    fill="var(--color-invalid)"
                    radius={[3, 3, 0, 0]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Metrics</CardTitle>
              <CardDescription>Pass rate and average score by evaluator</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
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
                  {overview.data.metrics.slice(0, 8).map((metric) => (
                    <TableRow key={metric.metricName}>
                      <TableCell className="pl-4 font-medium">{metric.metricName}</TableCell>
                      <TableCell>{formatNumber(metric.results)}</TableCell>
                      <TableCell>{(metric.passRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="pr-4">
                        {metric.averageNumericValue?.toFixed(3) ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Suites</CardTitle>
              <CardDescription>Outcome health by evaluation suite</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Suite</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Passed</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead className="pr-4">Pass rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.data.suites.slice(0, 8).map((suite) => (
                    <TableRow key={suite.suiteName}>
                      <TableCell className="pl-4 font-medium">{suite.suiteName}</TableCell>
                      <TableCell>{formatNumber(suite.results)}</TableCell>
                      <TableCell>{formatNumber(suite.passed)}</TableCell>
                      <TableCell>{formatNumber(suite.failed)}</TableCell>
                      <TableCell className="pr-4">{(suite.passRate * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="min-h-96">
        <CardHeader className="border-b">
          <CardTitle>Results</CardTitle>
          <CardDescription>
            Filter individual evaluation results and open their traces
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2 px-4">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              aria-label="Search evaluations"
              placeholder="Search suite, case, metric, or explanation"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </div>
          <FacetSelect
            label="All suites"
            value={filters.suite}
            values={facets.data?.suite}
            onChange={(suite) => setFilters({ suite })}
          />
          <FacetSelect
            label="All metrics"
            value={filters.metric}
            values={facets.data?.metric}
            onChange={(metric) => setFilters({ metric })}
          />
          <NativeSelect
            aria-label="Filter by outcome"
            value={filters.outcome ?? ""}
            onChange={(event) =>
              setFilters({
                outcome: (event.target.value || undefined) as EvaluationOutcome | undefined,
              })
            }
          >
            <NativeSelectOption value="">All outcomes</NativeSelectOption>
            {evaluationOutcomes.map((outcome) => (
              <NativeSelectOption key={outcome} value={outcome}>
                {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FacetSelect
            label="All environments"
            value={filters.environment}
            values={facets.data?.environment}
            onChange={(environment) => setFilters({ environment })}
          />
        </div>

        {evaluations.isLoading ? (
          <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
            Loading evaluations…
          </div>
        ) : evaluations.data?.items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Time</TableHead>
                <TableHead>Suite / case</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead className="pr-4">Trace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluations.data.items.map((evaluation) => (
                <EvaluationRow key={evaluation.id} evaluation={evaluation} projectId={project.id} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Flask />}
            title="No evaluation results"
            text="Report an evaluation from @anvia/lens or change the filters and time range."
          />
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            {evaluations.data
              ? `${formatNumber(evaluations.data.total)} results`
              : "Loading results"}
          </span>
          <div className="flex items-center gap-3">
            <NativeSelect
              aria-label="Rows per page"
              value={String(filters.pageSize)}
              onChange={(event) =>
                setFilters({ pageSize: Number(event.target.value) as 25 | 50 | 100 })
              }
            >
              <NativeSelectOption value="25">25 rows</NativeSelectOption>
              <NativeSelectOption value="50">50 rows</NativeSelectOption>
              <NativeSelectOption value="100">100 rows</NativeSelectOption>
            </NativeSelect>
            <span className="whitespace-nowrap">
              Page {filters.page} of {Math.max(1, evaluations.data?.pageCount ?? 1)}
            </span>
            <Pagination className="w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    aria-disabled={filters.page <= 1}
                    className={cn(filters.page <= 1 && "pointer-events-none opacity-50")}
                    onClick={(event) => {
                      event.preventDefault();
                      setFilters({ page: Math.max(1, filters.page - 1) }, false);
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    aria-disabled={filters.page >= (evaluations.data?.pageCount ?? 0)}
                    className={cn(
                      filters.page >= (evaluations.data?.pageCount ?? 0) &&
                        "pointer-events-none opacity-50",
                    )}
                    onClick={(event) => {
                      event.preventDefault();
                      setFilters({ page: filters.page + 1 }, false);
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </Card>
    </Page>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-heading text-2xl font-medium tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function FacetSelect(props: {
  label: string;
  value?: string;
  values?: TraceFacetValue[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <NativeSelect
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(event) => props.onChange(event.target.value || undefined)}
    >
      <NativeSelectOption value="">{props.label}</NativeSelectOption>
      {props.values?.map((item) => (
        <NativeSelectOption key={item.value} value={item.value}>
          {item.value} ({item.count})
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function EvaluationRow(props: { evaluation: EvaluationResult; projectId: string }) {
  const item = props.evaluation;
  const value =
    item.numericValue !== null
      ? item.numericValue.toFixed(3)
      : (item.categoricalValue ?? (item.dataType === "BOOLEAN" ? item.outcome : "—"));
  return (
    <TableRow>
      <TableCell className="pl-4" title={formatTimestamp(item.timestamp)}>
        {new Date(item.timestamp).toLocaleString()}
      </TableCell>
      <TableCell>
        <div className="grid max-w-52">
          <span className="truncate font-medium">{item.suiteName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.caseId ?? "No case ID"}
          </span>
        </div>
      </TableCell>
      <TableCell title={item.explanation ?? undefined}>{item.metricName}</TableCell>
      <TableCell>
        <OutcomeBadge outcome={item.outcome} />
      </TableCell>
      <TableCell className="font-mono">{value}</TableCell>
      <TableCell>
        {item.environment}
        {item.release ? <span className="text-muted-foreground"> · {item.release}</span> : null}
      </TableCell>
      <TableCell className="pr-4">
        {item.traceId ? (
          <Link
            className="font-mono text-primary hover:underline"
            to="/$projectId/traces/$traceId"
            params={{ projectId: props.projectId, traceId: item.traceId }}
          >
            {shortId(item.traceId)}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function OutcomeBadge({ outcome }: { outcome: EvaluationOutcome }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        outcome === "pass" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
        outcome === "fail" && "border-destructive/40 text-destructive",
        outcome === "invalid" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
    >
      {outcome === "pass" ? <CheckCircle /> : null}
      {outcome}
    </Badge>
  );
}
