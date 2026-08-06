import type { SessionSortField, TraceSortField } from "@lens/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@lens/ui/components/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { cn } from "@lens/ui/lib/utils";
import { Pulse as Activity, Chats as MessagesSquare } from "@phosphor-icons/react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { UserDetailState } from "../hooks/use-user-detail";
import { defaultSessionColumns, defaultTraceColumns } from "../types";
import {
  formatCost,
  formatNumber,
  formatPercent,
  formatTimestamp,
} from "../utils/observability-view";
import { LoadingRows } from "./loading-rows";
import { SessionDataTable } from "./session-data-table";
import { TraceDataTable } from "./trace-data-table";
import { UserRangeSelector } from "./user-range-selector";

export function UserDetailView({ state }: { state: UserDetailState }) {
  const { filters, sessions, setFilters, traces, user, userId } = state;
  const summary = user.data;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-background">
      <div className="border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-all font-mono text-lg font-semibold">{userId}</h1>
            {summary ? (
              <p className="mt-1 text-sm text-muted-foreground">
                First seen {formatTimestamp(summary.firstSeenAt)} · Last seen{" "}
                {formatTimestamp(summary.lastSeenAt)}
              </p>
            ) : null}
          </div>
          <UserRangeSelector value={filters.range} onChange={(range) => setFilters({ range })} />
        </div>
      </div>
      {user.error ? (
        <div className="p-4 md:p-6">
          <ErrorAlert error={user.error} />
        </div>
      ) : user.isLoading || summary === undefined ? (
        <LoadingRows />
      ) : (
        <>
          <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-5 md:p-6">
            <MetricCard label="Traces" value={formatNumber(summary.traceCount)} />
            <MetricCard label="Sessions" value={formatNumber(summary.sessionCount)} />
            <MetricCard
              label="Errors"
              value={`${formatNumber(summary.errorCount)} · ${formatPercent(summary.errorRate)}`}
            />
            <MetricCard
              label="Tokens"
              value={formatNumber(summary.totalTokens)}
              detail={`${formatNumber(summary.inputTokens)} in · ${formatNumber(summary.outputTokens)} out`}
            />
            <MetricCard
              label="Cost"
              value={formatCost(summary.totalCost)}
              detail={`${formatCost(summary.inputCost)} in · ${formatCost(summary.outputCost)} out`}
            />
          </div>
          <Tabs
            value={filters.tab}
            onValueChange={(value) =>
              setFilters({ tab: value as "traces" | "sessions", sort: "startedAt", order: "desc" })
            }
            className="min-h-[480px] flex-1 gap-0"
          >
            <div className="flex h-12 shrink-0 items-end border-b px-4 md:px-6">
              <TabsList variant="line">
                <TabsTrigger value="traces">Traces</TabsTrigger>
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="traces" className="flex min-h-0 flex-col">
              {traces.error ? (
                <div className="p-4">
                  <ErrorAlert error={traces.error} />
                </div>
              ) : traces.isLoading ? (
                <LoadingRows />
              ) : traces.data?.items.length ? (
                <TraceDataTable
                  traces={traces.data.items}
                  visibleColumns={defaultTraceColumns.filter((column) => column !== "userId")}
                  sort={filters.sort as TraceSortField}
                  order={filters.order}
                  onSort={(sort) =>
                    setFilters({
                      sort,
                      order: filters.sort === sort && filters.order === "desc" ? "asc" : "desc",
                    })
                  }
                />
              ) : (
                <EmptyState
                  icon={<Activity />}
                  title="No traces in this range"
                  text="Choose another time range to view this user’s traces."
                />
              )}
              <DetailPagination
                label="traces"
                page={filters.page}
                pageSize={filters.pageSize}
                pageCount={traces.data?.pageCount ?? 0}
                total={traces.data?.total}
                onChange={(changes, reset) => setFilters(changes, reset)}
              />
            </TabsContent>
            <TabsContent value="sessions" className="flex min-h-0 flex-col">
              {sessions.error ? (
                <div className="p-4">
                  <ErrorAlert error={sessions.error} />
                </div>
              ) : sessions.isLoading ? (
                <LoadingRows />
              ) : sessions.data?.items.length ? (
                <SessionDataTable
                  sessions={sessions.data.items}
                  visibleColumns={defaultSessionColumns.filter((column) => column !== "userId")}
                  sort={filters.sort as SessionSortField}
                  order={filters.order}
                  onSort={(sort) =>
                    setFilters({
                      sort,
                      order: filters.sort === sort && filters.order === "desc" ? "asc" : "desc",
                    })
                  }
                />
              ) : (
                <EmptyState
                  icon={<MessagesSquare />}
                  title="No sessions in this range"
                  text="This user may only have traces without session IDs."
                />
              )}
              <DetailPagination
                label="sessions"
                page={filters.page}
                pageSize={filters.pageSize}
                pageCount={sessions.data?.pageCount ?? 0}
                total={sessions.data?.total}
                onChange={(changes, reset) => setFilters(changes, reset)}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}

function MetricCard(props: { label: string; value: string; detail?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-xs text-muted-foreground">{props.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-heading text-xl font-semibold">{props.value}</div>
        {props.detail ? (
          <div className="mt-1 text-xs text-muted-foreground">{props.detail}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailPagination(props: {
  label: string;
  page: number;
  pageSize: 25 | 50 | 100;
  pageCount: number;
  total?: number;
  onChange: (changes: { page?: number; pageSize?: 25 | 50 | 100 }, reset?: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {props.total === undefined
          ? `Loading ${props.label}`
          : `${formatNumber(props.total)} ${props.label}`}
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
          Page {props.page} of {Math.max(1, props.pageCount)}
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
                aria-disabled={props.page >= props.pageCount}
                className={cn(props.page >= props.pageCount && "pointer-events-none opacity-50")}
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
