import type { TraceSortField, TraceSummary } from "@lens/contracts";
import { Checkbox } from "@lens/ui/components/checkbox";
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
import { defaultTraceColumns, type TraceColumnId } from "../types";
import { dataTableFeatures, traceTableColumns } from "../utils/observability-view";

export function TraceDataTable(props: {
  traces: TraceSummary[];
  visibleColumns?: TraceColumnId[];
  sort?: TraceSortField;
  order?: "asc" | "desc";
  onSort?: (sort: TraceSortField) => void;
  selectedTraceIds?: string[];
  onTraceSelectionChange?: (traceId: string, selected: boolean) => void;
}) {
  const { project } = useObservabilityProject();
  const columns = useMemo(
    () =>
      traceTableColumns({
        visible: props.visibleColumns ?? defaultTraceColumns,
        sort: props.sort,
        order: props.order,
        onSort: props.onSort,
      }),
    [props.visibleColumns, props.sort, props.order, props.onSort],
  );
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: props.traces,
    getRowId: (trace) => trace.traceId,
  });
  const selectable = props.onTraceSelectionChange !== undefined;
  return (
    <div className="min-h-0 w-full flex-1 overflow-auto">
      <Table className="w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {selectable ? (
                <TableHead className="w-10">
                  <span className="sr-only">Select traces</span>
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
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const selected = props.selectedTraceIds?.includes(row.original.traceId) ?? false;
            const selectionLimitReached = (props.selectedTraceIds?.length ?? 0) >= 4;
            return (
              <TableRow key={row.id} data-state={selected ? "selected" : undefined}>
                {selectable ? (
                  <TableCell className="w-10">
                    <Checkbox
                      aria-label={`Select ${row.original.name}`}
                      aria-disabled={!selected && selectionLimitReached}
                      checked={selected}
                      disabled={!selected && selectionLimitReached}
                      title={
                        !selected && selectionLimitReached
                          ? "You can compare up to 4 traces"
                          : undefined
                      }
                      onCheckedChange={(checked) =>
                        props.onTraceSelectionChange?.(row.original.traceId, checked === true)
                      }
                    />
                  </TableCell>
                ) : null}
                {row.getAllCells().map((cell) => {
                  const content = <table.FlexRender cell={cell} />;
                  return (
                    <TableCell key={cell.id}>
                      {cell.column.id === "trace" || cell.column.id === "open" ? (
                        content
                      ) : (
                        <Link
                          className="-m-2 block p-2 text-inherit"
                          to="/$projectId/traces/$traceId"
                          params={{ projectId: project.id, traceId: row.original.traceId }}
                          aria-label={`Open ${row.original.name}`}
                        >
                          {content}
                        </Link>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
