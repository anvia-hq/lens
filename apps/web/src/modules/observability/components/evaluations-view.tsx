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
  ArrowsDownUp as ArrowUpDown,
  CaretDown as ChevronDown,
  Flask,
  MagnifyingGlass as Search,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
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
import { formatNumber, shortId } from "../utils/trace-detail";
import { EvaluationExplorerLayout } from "./evaluation-explorer-layout";
import { EvaluationResultFilterPanel } from "./evaluation-filter-panel";
import { EvaluationResultDrawer, formatEvaluationResultValue } from "./evaluation-result-drawer";
import { formatEvaluationSource } from "./evaluation-source";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { LiveBadge } from "./live-badge";
import { LoadingRows } from "./loading-rows";
import { RangeSelector } from "./range-selector";
import { TableTimestamp } from "./table-timestamp";

const columnLabels: Record<EvaluationResultColumnId, string> = {
  timestamp: "Time",
  suite: "Suite",
  case: "Case",
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
  source: "Source",
};

const sortFields: Partial<Record<EvaluationResultColumnId, EvaluationSortField>> = {
  timestamp: "timestamp",
  suite: "suiteName",
  case: "caseId",
  metricName: "metricName",
  outcome: "outcome",
  value: "numericValue",
  environment: "environment",
  release: "release",
};

export function EvaluationsView({ state }: { state: EvaluationsState }) {
  const [selectedResult, setSelectedResult] = useState<EvaluationResult | null>(null);
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
      selectedResultId={selectedResult?.id}
      onChange={state.setFilters}
      onOpenMobileFilters={() => state.setMobileFiltersOpen(true)}
      onSearchChange={state.setSearchDraft}
      onSelectResult={setSelectedResult}
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
    <>
      <EvaluationExplorerLayout
        activeFilterCount={state.activeFilterCount}
        filterPanel={filterPanel}
        filterPanelCollapsed={state.filterPanelCollapsed}
        mobileFiltersOpen={state.mobileFiltersOpen}
        table={table}
        onFilterPanelCollapsedChange={state.setFilterPanelCollapsed}
        onMobileFiltersOpenChange={state.setMobileFiltersOpen}
      />
      <EvaluationResultDrawer
        projectId={state.project.id}
        result={selectedResult}
        onOpenChange={(open) => {
          if (!open) setSelectedResult(null);
        }}
      />
    </>
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
  selectedResultId?: string;
  actions?: ReactNode;
  onOpenMobileFilters: () => void;
  onSearchChange: (value: string) => void;
  onSelectResult: (result: EvaluationResult) => void;
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
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {props.filters.columns.map((column) => {
                  const field = sortFields[column];
                  return (
                    <TableHead
                      key={column}
                      aria-sort={
                        props.filters.sort === field
                          ? props.filters.order === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {field ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3"
                          onClick={() => sort(field)}
                          aria-label={`Sort by ${columnLabels[column]}${
                            props.filters.sort === field ? `, currently ${props.filters.order}` : ""
                          }`}
                        >
                          {columnLabels[column]}
                          <ArrowUpDown
                            className={cn(props.filters.sort === field && "text-primary")}
                          />
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
                <TableRow
                  aria-label={`Open ${result.metricName} result for ${result.caseId ?? result.suiteName}`}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  data-state={props.selectedResultId === result.id ? "selected" : undefined}
                  key={result.id}
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a, button, input, select")) return;
                    props.onSelectResult(result);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    props.onSelectResult(result);
                  }}
                >
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
  if (column === "timestamp") return <TableTimestamp value={result.timestamp} />;
  if (column === "suite")
    return (
      <span className="block max-w-48 truncate font-medium" title={result.suiteName}>
        {result.suiteName}
      </span>
    );
  if (column === "case")
    return (
      <span className="block max-w-48 truncate font-mono" title={result.caseId ?? undefined}>
        {result.caseId ?? "—"}
      </span>
    );
  if (column === "metricName")
    return <span title={result.explanation ?? undefined}>{result.metricName}</span>;
  if (column === "outcome") return <OutcomeBadge outcome={result.outcome} />;
  if (column === "value")
    return <span className="font-mono">{formatEvaluationResultValue(result)}</span>;
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
  if (column === "source") return formatEvaluationSource(result.source);
  if (column === "resultId") {
    return <span className="whitespace-nowrap font-mono text-primary">{result.id}</span>;
  }
  return null;
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
  return <EvaluationStatusBadge status={outcome} />;
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
              disabled={column === "suite"}
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
