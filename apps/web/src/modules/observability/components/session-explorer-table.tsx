import type { Page as PaginatedPage, SessionSortField, SessionSummary } from "@lens/contracts";
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
import { cn } from "@lens/ui/lib/utils";
import {
  AltArrowDown as ChevronDown,
  Dialog2 as MessagesSquare,
  Magnifer as Search,
  Filter as SlidersHorizontal,
} from "@solar-icons/react";
import type { ReactNode } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import {
  defaultSessionColumns,
  type ResolvedSessionsSearch,
  type SessionsSearch,
  sessionColumnIds,
} from "../types";
import { formatNumber, sessionColumnLabels } from "../utils/observability-view";
import { LoadingRows } from "./loading-rows";
import { SessionDataTable } from "./session-data-table";

export function SessionExplorerTable(props: {
  filters: ResolvedSessionsSearch;
  searchDraft: string;
  onSearchChange: (value: string) => void;
  data?: PaginatedPage<SessionSummary>;
  loading: boolean;
  error: unknown;
  activeFilterCount: number;
  onOpenMobileFilters: () => void;
  onChange: (changes: Partial<SessionsSearch>, resetPage?: boolean) => void;
  actions?: ReactNode;
}) {
  const sort = (field: SessionSortField) =>
    props.onChange({
      sort: field,
      order: props.filters.sort === field && props.filters.order === "desc" ? "asc" : "desc",
    });
  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
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
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            aria-label="Search sessions"
            placeholder="Search session or user ID"
            value={props.searchDraft}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            Columns <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {sessionColumnIds.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={props.filters.columns.includes(column)}
                  disabled={column === "session"}
                  onCheckedChange={(checked) =>
                    props.onChange(
                      {
                        columns: checked
                          ? sessionColumnIds.filter(
                              (item) => props.filters.columns.includes(item) || item === column,
                            )
                          : props.filters.columns.filter((item) => item !== column),
                      },
                      false,
                    )
                  }
                >
                  {sessionColumnLabels[column]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => props.onChange({ columns: defaultSessionColumns }, false)}
            >
              Reset columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {props.actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {props.error ? (
          <div className="p-4">
            <ErrorAlert error={props.error} />
          </div>
        ) : props.loading ? (
          <LoadingRows />
        ) : props.data?.items.length ? (
          <SessionDataTable
            sessions={props.data.items}
            visibleColumns={props.filters.columns}
            sort={props.filters.sort}
            order={props.filters.order}
            onSort={sort}
          />
        ) : (
          <EmptyState
            icon={<MessagesSquare />}
            title="No sessions found"
            text="Try another filter or send traces containing a session ID."
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {props.data ? `${formatNumber(props.data.total)} sessions` : "Loading sessions"}
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
    </div>
  );
}
