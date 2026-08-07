import type { EvaluationRunSortField, EvaluationRunSummary, Page } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Checkbox } from "@lens/ui/components/checkbox";
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
  ArrowsLeftRight,
  ChartLine,
  CaretDown as ChevronDown,
  Flask,
  MagnifyingGlass as Search,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { EvaluationRunsState } from "../hooks/use-evaluation-runs";
import {
  defaultEvaluationRunColumns,
  type EvaluationRunColumnId,
  type EvaluationRunsSearch,
  evaluationRunColumnIds,
  type ResolvedEvaluationRunsSearch,
} from "../types";
import { formatDuration, formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { EvaluationExplorerLayout } from "./evaluation-explorer-layout";
import { EvaluationRunFilterPanel } from "./evaluation-filter-panel";
import { EvaluationOverviewDrawer } from "./evaluation-overview-drawer";
import { LiveBadge } from "./live-badge";
import { LoadingRows } from "./loading-rows";
import { RangeSelector } from "./range-selector";

const columnLabels: Record<EvaluationRunColumnId, string> = {
  startedAt: "Started",
  suite: "Suite",
  status: "Status",
  release: "Release",
  evaluatedCases: "Cases",
  passRate: "Pass rate",
  durationMs: "Duration",
  environment: "Environment",
  dataset: "Dataset",
  results: "Results",
  p95LatencyMs: "P95 latency",
  averageTotalTokens: "Avg tokens",
  traceCoverage: "Trace coverage",
  runId: "Run ID",
};

const sortFields: Partial<Record<EvaluationRunColumnId, EvaluationRunSortField>> = {
  startedAt: "startedAt",
  suite: "suiteName",
  status: "status",
  release: "release",
  evaluatedCases: "evaluatedCases",
  passRate: "passRate",
  durationMs: "durationMs",
  environment: "environment",
  results: "results",
  p95LatencyMs: "p95LatencyMs",
  averageTotalTokens: "averageTotalTokens",
  traceCoverage: "traceCoverage",
};

export function EvaluationRunsView({ state }: { state: EvaluationRunsState }) {
  const filterPanel = (
    <EvaluationRunFilterPanel
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
    <EvaluationRunExplorerTable
      activeFilterCount={state.activeFilterCount}
      data={state.runs.data}
      error={state.runs.error}
      filters={state.filters}
      loading={state.runs.isLoading}
      searchDraft={state.searchDraft}
      selectedRuns={state.selectedRuns}
      onChange={state.setFilters}
      onClearSelection={state.clearRunSelection}
      onCompare={state.compareSelectedRuns}
      onOpenMobileFilters={() => state.setMobileFiltersOpen(true)}
      onOpenOverview={() => state.setOverviewOpen(true)}
      onSearchChange={state.setSearchDraft}
      onSelectionChange={state.toggleRunSelection}
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
      <EvaluationOverviewDrawer
        open={state.overviewOpen}
        overview={state.overview}
        onOpenChange={state.setOverviewOpen}
      />
    </>
  );
}

function EvaluationRunExplorerTable(props: {
  filters: ResolvedEvaluationRunsSearch;
  searchDraft: string;
  data?: Page<EvaluationRunSummary>;
  loading: boolean;
  error: unknown;
  activeFilterCount: number;
  selectedRuns: EvaluationRunSummary[];
  actions?: ReactNode;
  onOpenMobileFilters: () => void;
  onOpenOverview: () => void;
  onSearchChange: (value: string) => void;
  onChange: (changes: Partial<EvaluationRunsSearch>, resetPage?: boolean) => void;
  onClearSelection: () => void;
  onCompare: () => void;
  onSelectionChange: (run: EvaluationRunSummary, selected: boolean) => void;
}) {
  const sort = (field: EvaluationRunSortField) =>
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
            aria-label="Search evaluation runs"
            placeholder="Search run ID, suite, or release"
            value={props.searchDraft}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={props.onOpenOverview}>
          <ChartLine /> Overview
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={props.selectedRuns.length !== 2}
          onClick={props.onCompare}
        >
          <ArrowsLeftRight /> Compare ({props.selectedRuns.length})
        </Button>
        {props.selectedRuns.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={props.onClearSelection}>
            Clear
          </Button>
        ) : null}
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
                <TableHead className="w-10 pl-4">
                  <span className="sr-only">Select</span>
                </TableHead>
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
              {props.data.items.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  columns={props.filters.columns}
                  selectedRuns={props.selectedRuns}
                  onSelectionChange={props.onSelectionChange}
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Flask />}
            title="No evaluation runs"
            text="Try another filter or execute runEvalSuite()."
          />
        )}
      </div>
      <ExplorerPagination
        noun="runs"
        data={props.data}
        page={props.filters.page}
        pageSize={props.filters.pageSize}
        onChange={props.onChange}
      />
    </div>
  );
}

function RunRow(props: {
  run: EvaluationRunSummary;
  columns: EvaluationRunColumnId[];
  selectedRuns: EvaluationRunSummary[];
  onSelectionChange: (run: EvaluationRunSummary, selected: boolean) => void;
}) {
  const run = props.run;
  const selected = props.selectedRuns.some((item) => item.id === run.id);
  const first = props.selectedRuns[0];
  const disabled =
    !selected &&
    (run.status !== "completed" ||
      props.selectedRuns.length >= 2 ||
      (first !== undefined &&
        (first.suiteName !== run.suiteName || first.environment !== run.environment)));
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Checkbox
          aria-label={`Select ${run.suiteName} run ${shortId(run.id)}`}
          checked={selected}
          disabled={disabled}
          onCheckedChange={(checked) => props.onSelectionChange(run, checked)}
        />
      </TableCell>
      {props.columns.map((column) => (
        <TableCell key={column}>{runCell(run, column)}</TableCell>
      ))}
    </TableRow>
  );
}

function runCell(run: EvaluationRunSummary, column: EvaluationRunColumnId): ReactNode {
  if (column === "startedAt") return formatTimestamp(run.startedAt);
  if (column === "suite") {
    return (
      <Link
        className="font-medium text-primary hover:underline"
        to="/$projectId/evaluations/runs/$runId"
        params={{ projectId: run.projectId, runId: run.id }}
      >
        {run.suiteName}
      </Link>
    );
  }
  if (column === "status") return <RunStatus status={run.status} />;
  if (column === "release") return run.release ?? "Unreleased";
  if (column === "evaluatedCases") return formatNumber(run.evaluatedCases);
  if (column === "passRate") return run.results > 0 ? `${(run.passRate * 100).toFixed(1)}%` : "—";
  if (column === "durationMs")
    return run.durationMs === null ? "—" : formatDuration(run.durationMs);
  if (column === "environment") return run.environment;
  if (column === "dataset")
    return run.datasetName
      ? `${run.datasetName}${run.datasetVersion ? `@${run.datasetVersion}` : ""}`
      : "—";
  if (column === "results") return formatNumber(run.results);
  if (column === "p95LatencyMs")
    return run.p95LatencyMs === null ? "—" : formatDuration(run.p95LatencyMs);
  if (column === "averageTotalTokens")
    return run.averageTotalTokens === null ? "—" : formatNumber(run.averageTotalTokens);
  if (column === "traceCoverage") return `${(run.traceCoverage * 100).toFixed(1)}%`;
  return (
    <span className="font-mono" title={run.id}>
      {shortId(run.id)}
    </span>
  );
}

function RunStatus({ status }: { status: EvaluationRunSummary["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "completed" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
        status === "failed" && "border-destructive/40 text-destructive",
      )}
    >
      {status}
    </Badge>
  );
}

function ColumnMenu(props: {
  filters: ResolvedEvaluationRunsSearch;
  onChange: (changes: Partial<EvaluationRunsSearch>, resetPage?: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="h-8" variant="outline" size="sm" />}>
        Columns <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          {evaluationRunColumnIds.map((column) => (
            <DropdownMenuCheckboxItem
              key={column}
              checked={props.filters.columns.includes(column)}
              disabled={column === "suite"}
              onCheckedChange={(checked) =>
                props.onChange(
                  {
                    columns: checked
                      ? evaluationRunColumnIds.filter(
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
          onClick={() => props.onChange({ columns: defaultEvaluationRunColumns }, false)}
        >
          Reset columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExplorerPagination(props: {
  noun: string;
  data?: Page<unknown>;
  page: number;
  pageSize: 25 | 50 | 100;
  onChange: (changes: Partial<EvaluationRunsSearch>, resetPage?: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {props.data ? `${formatNumber(props.data.total)} ${props.noun}` : `Loading ${props.noun}`}
      </span>
      <div className="flex items-center gap-3">
        <NativeSelect
          aria-label="Rows per page"
          value={String(props.pageSize)}
          onChange={(event) =>
            props.onChange({ pageSize: Number(event.target.value) as 25 | 50 | 100 })
          }
        >
          <NativeSelectOption value="25">25 rows</NativeSelectOption>
          <NativeSelectOption value="50">50 rows</NativeSelectOption>
          <NativeSelectOption value="100">100 rows</NativeSelectOption>
        </NativeSelect>
        <span className="whitespace-nowrap">
          Page {props.page} of {Math.max(1, props.data?.pageCount ?? 1)}
        </span>
        <Pagination className="w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={props.page <= 1}
                className={cn(props.page <= 1 && "pointer-events-none opacity-50")}
                onClick={(event) => {
                  event.preventDefault();
                  props.onChange({ page: Math.max(1, props.page - 1) }, false);
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={props.page >= (props.data?.pageCount ?? 0)}
                className={cn(
                  props.page >= (props.data?.pageCount ?? 0) && "pointer-events-none opacity-50",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  props.onChange({ page: props.page + 1 }, false);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
