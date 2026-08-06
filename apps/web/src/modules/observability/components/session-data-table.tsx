import type { SessionSortField, SessionSummary } from "@lens/contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Link } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { useObservabilityProject } from "../hooks/use-observability-project";
import type { SessionColumnId } from "../types";
import { dataTableFeatures, sessionTableColumns } from "../utils/observability-view";

export function SessionDataTable(props: {
  sessions: SessionSummary[];
  visibleColumns: SessionColumnId[];
  sort: SessionSortField;
  order: "asc" | "desc";
  onSort: (sort: SessionSortField) => void;
}) {
  const { project } = useObservabilityProject();
  const columns = useMemo(
    () =>
      sessionTableColumns({
        visible: props.visibleColumns,
        sort: props.sort,
        order: props.order,
        onSort: props.onSort,
      }),
    [props.onSort, props.order, props.sort, props.visibleColumns],
  );
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: props.sessions,
    getRowId: (session) => session.sessionId,
  });
  return (
    <div className="min-h-0 w-full flex-1 overflow-auto">
      <Table className="w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const direction = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => {
                const content = <table.FlexRender cell={cell} />;
                return (
                  <TableCell key={cell.id}>
                    {cell.column.id === "session" || cell.column.id === "open" ? (
                      content
                    ) : (
                      <Link
                        className="-m-2 block p-2 text-inherit"
                        to="/$projectId/sessions/$sessionId"
                        params={{ projectId: project.id, sessionId: row.original.sessionId }}
                        aria-label={`Open session ${row.original.sessionId}`}
                      >
                        {content}
                      </Link>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
