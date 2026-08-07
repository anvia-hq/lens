import type { EvaluationResult, EvaluationSortField, Page } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lens/ui/components/dropdown-menu";
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
import {
  CheckCircle,
  CaretDown as ChevronDown,
  Flask,
  MagnifyingGlass as Search,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { EvaluationsState } from "../hooks/use-evaluations";
import {
  defaultEvaluationResultColumns,
  type EvaluationResultColumnId,
  type EvaluationResultsSearch,
  evaluationResultColumnIds,
  type ResolvedEvaluationResultsSearch,
} from "../types";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { EvaluationExplorerLayout } from "./evaluation-explorer-layout";
import { EvaluationResultFilterPanel } from "./evaluation-filter-panel";
import { LiveBadge } from "./live-badge";
import { LoadingRows } from "./loading-rows";
import { RangeSelector } from "./range-selector";

const columnLabels: Record<EvaluationResultColumnId, string> = {
  timestamp: "Time",
  suiteCase: "Suite / case",
  metricName: "Metric",
  outcome: "Outcome",
  value: "Value",
  environment: "Environment",
  release: "Release",
  traceId: "Trace",
  runId: "Run",
  serviceName: "Service",
  explanation: "Explanation",
  observationId: "Observation ID",
  resultId: "Result ID",
};

const sortFields: Partial<Record<EvaluationResultColumnId, EvaluationSortField>> = {
  timestamp: "timestamp",
  suiteCase: "suiteName",
  metricName: "metricName",
  outcome: "outcome",
  value: "numericValue",
  environment: "environment",
  release: "release",
};

export function EvaluationsView({ state }: { state: EvaluationsState }) {
  const filterPanel = (
    <EvaluationResultFilterPanel
      filters={state.filters}
      facets={state.facets.data}
      loading={state.facets.isLoading}
      error={state.facets.error}
      activeCount={state.activeFilterCount}
      onChange={state.setFilters}
      onClear={state.clearFilters}
      onCollapse={() => state.setFilterPanelCollapsed(true)}
    />
  );
  const table = (
    <EvaluationResultExplorerTable
      activeFilterCount={state.activeFilterCount}
      data={state.evaluations.data}
      error={state.evaluations.error}
      filters={state.filters}
      loading={state.evaluations.isLoading}
      projectId={state.project.id}
      searchDraft={state.searchDraft}
      onChange={state.setFilters}
      onOpenMobileFilters={() => state.setMobileFiltersOpen(true)}
      onSearchChange={state.setSearchDraft}
      actions={
        <>
          <RangeSelector
            value={state.filters.range}
            onChange={(range) => state.setFilters({ range })}
          />
          <LiveBadge interval={state.refreshInterval} onIntervalChange={state.setRefreshInterval} />
        </>
      }
    />
  );
  return (
    <EvaluationExplorerLayout
      activeFilterCount={state.activeFilterCount}
      filterPanel={filterPanel}
      filterPanelCollapsed={state.filterPanelCollapsed}
      mobileFiltersOpen={state.mobileFiltersOpen}
      table={table}
      onFilterPanelCollapsedChange={state.setFilterPanelCollapsed}
      onMobileFiltersOpenChange={state.setMobileFiltersOpen}
    />
  );
}

function EvaluationResultExplorerTable(props: {
  filters: ResolvedEvaluationResultsSearch;
  searchDraft: string;
  projectId: string;
  data?: Page<EvaluationResult>;
  loading: boolean;
  error: unknown;
  activeFilterCount: number;
  actions?: ReactNode;
  onOpenMobileFilters: () => void;
  onSearchChange: (value: string) => void;
  onChange: (changes: Partial<EvaluationResultsSearch>, resetPage?: boolean) => void;
}) {
  const sort = (field: EvaluationSortField) =>
    props.onChange({
      sort: field,
      order: props.filters.sort === field && props.filters.order === "desc" ? "asc" : "desc",
    });
  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:py-0">
        <Button
          variant="outline"
          size="sm"
          className="md:hidden"
          onClick={props.onOpenMobileFilters}
        >
          <SlidersHorizontal /> Filters
          {props.activeFilterCount > 0 ? (
            <Badge variant="secondary">{props.activeFilterCount}</Badge>
          ) : null}
        </Button>
        <div className="relative h-8 min-w-52 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            aria-label="Search evaluation results"
            placeholder="Search case, trace, or explanation"
            value={props.searchDraft}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </div>
        <ColumnMenu filters={props.filters} onChange={props.onChange} />
        {props.actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {props.error ? (
          <div className="p-4">
            <ErrorAlert error={props.error} />
          </div>
        ) : props.loading ? (
          <LoadingRows />
        ) : props.data?.items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {props.filters.columns.map((column) => {
                  const field = sortFields[column];
                  return (
                    <TableHead key={column}>
                      {field ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3"
                          onClick={() => sort(field)}
                        >
                          {columnLabels[column]}
                          {props.filters.sort === field
                            ? props.filters.order === "asc"
                              ? " ↑"
                              : " ↓"
                            : null}
                        </Button>
                      ) : (
                        columnLabels[column]
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.data.items.map((result) => (
                <TableRow key={result.id}>
                  {props.filters.columns.map((column) => (
                    <TableCell key={column}>
                      {resultCell(result, column, props.projectId)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Flask />}
            title="No evaluation results"
            text="Try another filter or report an evaluation from @anvia/lens."
          />
        )}
      </div>
      <ResultPagination data={props.data} filters={props.filters} onChange={props.onChange} />
    </div>
  );
}

function resultCell(
  result: EvaluationResult,
  column: EvaluationResultColumnId,
  projectId: string,
): ReactNode {
  if (column === "timestamp") return formatTimestamp(result.timestamp);
  if (column === "suiteCase")
    return (
      <div className="grid max-w-52">
        <span className="truncate font-medium">{result.suiteName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {result.caseId ?? "No case ID"}
        </span>
      </div>
    );
  if (column === "metricName")
    return <span title={result.explanation ?? undefined}>{result.metricName}</span>;
  if (column === "outcome") return <OutcomeBadge outcome={result.outcome} />;
  if (column === "value")
    return (
      <span className="font-mono">
        {result.numericValue?.toFixed(3) ??
          result.categoricalValue ??
          (result.dataType === "BOOLEAN" ? result.outcome : "—")}
      </span>
    );
  if (column === "environment") return result.environment;
  if (column === "release") return result.release ?? "—";
  if (column === "traceId")
    return <EntityLink projectId={projectId} id={result.traceId} kind="trace" />;
  if (column === "runId") return <EntityLink projectId={projectId} id={result.runId} kind="run" />;
  if (column === "serviceName") return result.serviceName;
  if (column === "explanation")
    return (
      <span className="block max-w-72 truncate" title={result.explanation ?? undefined}>
        {result.explanation ?? "—"}
      </span>
    );
  if (column === "observationId")
    return result.observationId ? (
      <span className="font-mono" title={result.observationId}>
        {shortId(result.observationId)}
      </span>
    ) : (
      "—"
    );
  return (
    <span className="font-mono" title={result.id}>
      {shortId(result.id)}
    </span>
  );
}

function EntityLink(props: { projectId: string; id: string | null; kind: "trace" | "run" }) {
  if (!props.id) return <span className="text-muted-foreground">—</span>;
  return props.kind === "trace" ? (
    <Link
      className="font-mono text-primary hover:underline"
      to="/$projectId/traces/$traceId"
      params={{ projectId: props.projectId, traceId: props.id }}
    >
      {shortId(props.id)}
    </Link>
  ) : (
    <Link
      className="font-mono text-primary hover:underline"
      to="/$projectId/evaluations/runs/$runId"
      params={{ projectId: props.projectId, runId: props.id }}
    >
      {shortId(props.id)}
    </Link>
  );
}

function OutcomeBadge({ outcome }: { outcome: EvaluationResult["outcome"] }) {
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

function ColumnMenu(props: {
  filters: ResolvedEvaluationResultsSearch;
  onChange: (changes: Partial<EvaluationResultsSearch>, resetPage?: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="h-8" variant="outline" size="sm" />}>
        Columns <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          {evaluationResultColumnIds.map((column) => (
            <DropdownMenuCheckboxItem
              key={column}
              checked={props.filters.columns.includes(column)}
              disabled={column === "suiteCase"}
              onCheckedChange={(checked) =>
                props.onChange(
                  {
                    columns: checked
                      ? evaluationResultColumnIds.filter(
                          (item) => props.filters.columns.includes(item) || item === column,
                        )
                      : props.filters.columns.filter((item) => item !== column),
                  },
                  false,
                )
              }
            >
              {columnLabels[column]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => props.onChange({ columns: defaultEvaluationResultColumns }, false)}
        >
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResultPagination(props: {
  data?: Page<unknown>;
  filters: ResolvedEvaluationResultsSearch;
  onChange: (changes: Partial<EvaluationResultsSearch>, resetPage?: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {props.data ? `${formatNumber(props.data.total)} results` : "Loading results"}
      </span>
      <div className="flex items-center gap-3">
        <NativeSelect
          aria-label="Rows per page"
          value={String(props.filters.pageSize)}
          onChange={(event) =>
            props.onChange({ pageSize: Number(event.target.value) as 25 | 50 | 100 })
          }
        >
          <NativeSelectOption value="25">25 rows</NativeSelectOption>
          <NativeSelectOption value="50">50 rows</NativeSelectOption>
          <NativeSelectOption value="100">100 rows</NativeSelectOption>
        </NativeSelect>
        <span className="whitespace-nowrap">
          Page {props.filters.page} of {Math.max(1, props.data?.pageCount ?? 1)}
        </span>
        <Pagination className="w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={props.filters.page <= 1}
                className={cn(props.filters.page <= 1 && "pointer-events-none opacity-50")}
                onClick={(event) => {
                  event.preventDefault();
                  props.onChange({ page: Math.max(1, props.filters.page - 1) }, false);
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={props.filters.page >= (props.data?.pageCount ?? 0)}
                className={cn(
                  props.filters.page >= (props.data?.pageCount ?? 0) &&
                    "pointer-events-none opacity-50",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  props.onChange({ page: props.filters.page + 1 }, false);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
