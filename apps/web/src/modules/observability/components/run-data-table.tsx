import type { RunListItem, RunSortField } from "@lens/contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { useObservabilityProject } from "../hooks/use-observability-project";
import { defaultRunColumns, type RunColumnId } from "../types";
import { dataTableFeatures, runTableColumns } from "../utils/observability-view";

export function RunDataTable(props: {
  runs: RunListItem[];
  visibleColumns?: RunColumnId[];
  sort?: RunSortField;
  order?: "asc" | "desc";
  onSort?: (sort: RunSortField) => void;
  activeSpanId?: string;
  onSelectRun: (run: RunListItem) => void;
}) {
  const { project } = useObservabilityProject();
  const columns = useMemo(
    () =>
      runTableColumns({
        projectId: project.id,
        visible: props.visibleColumns ?? defaultRunColumns,
        sort: props.sort,
        order: props.order,
        onSort: props.onSort,
      }),
    [project.id, props.visibleColumns, props.sort, props.order, props.onSort],
  );
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: props.runs,
    getRowId: (run) => `${run.traceId}:${run.spanId}`,
  });

  return (
    <div className="min-h-0 w-full flex-1 overflow-auto">
      <Table className="w-full">
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const ariaSort =
                  props.onSort && props.sort === header.column.id
                    ? props.order === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined;
                return (
                  <TableHead key={header.id} aria-sort={ariaSort}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const active = props.activeSpanId === row.original.spanId;
            return (
              <TableRow
                key={row.id}
                data-state={active ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => props.onSelectRun(row.original)}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
