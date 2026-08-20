import type { SessionSortField, SessionSummary } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Checkbox } from "@lens/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Trash } from "@phosphor-icons/react";
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
  selectedSessionIds?: string[];
  onSelectionChange?: (sessionId: string, selected: boolean) => void;
  onVisibleSelectionChange?: (sessionIds: string[], selected: boolean) => void;
  onDelete?: (sessionId: string) => void;
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
  const visibleIds = props.sessions.map((session) => session.sessionId);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => props.selectedSessionIds?.includes(id));
  return (
    <div className="min-h-0 w-full flex-1 overflow-auto">
      <Table className="w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {props.onSelectionChange ? (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all visible sessions"
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) =>
                      props.onVisibleSelectionChange?.(visibleIds, checked === true)
                    }
                  />
                </TableHead>
              ) : null}
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
              {props.onDelete ? <TableHead className="w-10" /> : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={
                props.selectedSessionIds?.includes(row.original.sessionId) ? "selected" : undefined
              }
            >
              {props.onSelectionChange ? (
                <TableCell className="w-10">
                  <Checkbox
                    aria-label={`Select session ${row.original.sessionId}`}
                    checked={props.selectedSessionIds?.includes(row.original.sessionId) ?? false}
                    disabled={
                      !(props.selectedSessionIds?.includes(row.original.sessionId) ?? false) &&
                      (props.selectedSessionIds?.length ?? 0) >= 100
                    }
                    onCheckedChange={(checked) =>
                      props.onSelectionChange?.(row.original.sessionId, checked === true)
                    }
                  />
                </TableCell>
              ) : null}
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
              {props.onDelete ? (
                <TableCell className="w-10">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete session ${row.original.sessionId}`}
                    onClick={() => props.onDelete?.(row.original.sessionId)}
                  >
                    <Trash />
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
