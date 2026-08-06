import type { UserSortField, UserSummary } from "@lens/contracts";
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
  MagnifyingGlass as Search,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { UsersState } from "../hooks/use-users";
import { defaultUserColumns, type UserColumnId, userColumnIds } from "../types";
import {
  formatCost,
  formatNumber,
  formatPercent,
  formatTimestamp,
  relativeTime,
} from "../utils/observability-view";
import { LiveBadge } from "./live-badge";
import { LoadingRows } from "./loading-rows";
import { UserRangeSelector } from "./user-range-selector";

const labels: Record<UserColumnId, string> = {
  userId: "User",
  firstSeenAt: "First seen",
  lastSeenAt: "Last seen",
  traceCount: "Traces",
  sessionCount: "Sessions",
  errorRate: "Errors",
  totalTokens: "Tokens",
  totalCost: "Cost",
};

const sortFields: Record<UserColumnId, UserSortField> = {
  userId: "userId",
  firstSeenAt: "firstSeenAt",
  lastSeenAt: "lastSeenAt",
  traceCount: "traceCount",
  sessionCount: "sessionCount",
  errorRate: "errorRate",
  totalTokens: "totalTokens",
  totalCost: "totalCost",
};

export function UsersView({ state }: { state: UsersState }) {
  const {
    filters,
    project,
    refreshInterval,
    searchDraft,
    setFilters,
    setRefreshInterval,
    setSearchDraft,
    users,
  } = state;
  const changeSort = (sort: UserSortField) =>
    setFilters({
      sort,
      order: filters.sort === sort && filters.order === "desc" ? "asc" : "desc",
    });
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:py-0">
        <div className="relative h-8 min-w-52 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            aria-label="Search users"
            placeholder="Search user ID"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button className="h-8" variant="outline" size="sm" />}>
            Columns <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {userColumnIds.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column}
                  checked={filters.columns.includes(column)}
                  disabled={column === "userId"}
                  onCheckedChange={(checked) =>
                    setFilters(
                      {
                        columns: checked
                          ? userColumnIds.filter(
                              (item) => filters.columns.includes(item) || item === column,
                            )
                          : filters.columns.filter((item) => item !== column),
                      },
                      false,
                    )
                  }
                >
                  {labels[column]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setFilters({ columns: defaultUserColumns }, false)}>
              Reset columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <UserRangeSelector value={filters.range} onChange={(range) => setFilters({ range })} />
        <LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {users.error ? (
          <div className="p-4">
            <ErrorAlert error={users.error} />
          </div>
        ) : users.isLoading ? (
          <LoadingRows />
        ) : users.data?.items.length ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="w-full">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {filters.columns.map((column) => (
                    <TableHead
                      key={column}
                      aria-sort={
                        filters.sort === sortFields[column]
                          ? filters.order === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => changeSort(sortFields[column])}
                      >
                        {labels[column]}
                        <ArrowUpDown
                          className={cn(filters.sort === sortFields[column] && "text-primary")}
                        />
                      </Button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((user) => (
                  <TableRow key={user.userId}>
                    {filters.columns.map((column) => (
                      <TableCell key={column}>
                        <Link
                          className="-m-2 block p-2 text-inherit"
                          to="/$projectId/users/$userId"
                          params={{ projectId: project.id, userId: user.userId }}
                          search={{
                            range: filters.range,
                            tab: "traces",
                            page: 1,
                            pageSize: 50,
                            order: "desc",
                          }}
                        >
                          <UserCell user={user} column={column} />
                        </Link>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={<Users />}
            title="No users found"
            text="Send traces with a user ID or try another search and time range."
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {users.data ? `${formatNumber(users.data.total)} users` : "Loading users"}
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
            Page {filters.page} of {Math.max(1, users.data?.pageCount ?? 1)}
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
                  aria-disabled={filters.page >= (users.data?.pageCount ?? 0)}
                  className={cn(
                    filters.page >= (users.data?.pageCount ?? 0) &&
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
    </main>
  );
}

function UserCell({ user, column }: { user: UserSummary; column: UserColumnId }) {
  if (column === "userId") return <span className="font-mono text-xs">{user.userId}</span>;
  if (column === "firstSeenAt")
    return (
      <span className="text-xs" title={user.firstSeenAt}>
        {formatTimestamp(user.firstSeenAt)}
      </span>
    );
  if (column === "lastSeenAt")
    return <span title={formatTimestamp(user.lastSeenAt)}>{relativeTime(user.lastSeenAt)}</span>;
  if (column === "traceCount")
    return <span className="font-mono">{formatNumber(user.traceCount)}</span>;
  if (column === "sessionCount")
    return <span className="font-mono">{formatNumber(user.sessionCount)}</span>;
  if (column === "errorRate")
    return (
      <span className="whitespace-nowrap font-mono">
        {formatNumber(user.errorCount)}{" "}
        <span className="text-muted-foreground">· {formatPercent(user.errorRate)}</span>
      </span>
    );
  if (column === "totalTokens")
    return <span className="whitespace-nowrap font-mono">{formatNumber(user.totalTokens)}</span>;
  return <span className="font-mono">{formatCost(user.totalCost)}</span>;
}
