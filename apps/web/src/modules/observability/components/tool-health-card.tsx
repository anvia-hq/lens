import type { Metrics } from "@lens/contracts";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@lens/ui/components/table";
import { formatDuration, formatNumber } from "../utils/observability-view";
import { BreakdownCard, cellClass, ErrorRate, Th, TitleTh } from "./breakdown-table";

export function ToolHealthCard({ metrics }: { metrics: Metrics }) {
  const maxCalls = Math.max(1, ...metrics.tools.map((tool) => tool.calls));
  return (
    <BreakdownCard>
      {metrics.tools.length === 0 ? (
        <p className="px-(--card-spacing) text-xs text-muted-foreground">
          No tool calls in this window.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TitleTh
                title="Tool health"
                description="Most-used tool calls, duration, and failures"
              />
              <Th className="text-right">Calls</Th>
              <Th className="text-right">P95 duration</Th>
              <Th className="text-right">Errors</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.tools.map((tool) => (
              <TableRow key={tool.toolName}>
                <TableCell className="max-w-80 truncate py-1 font-medium first:pl-(--card-spacing)">
                  {tool.toolName}
                </TableCell>
                <TableCell className={cellClass}>
                  <span className="inline-flex items-center justify-end gap-2">
                    <span aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-viz-indigo"
                        style={{ width: `${(tool.calls / maxCalls) * 100}%` }}
                      />
                    </span>
                    <span className="w-12 text-right">{formatNumber(tool.calls)}</span>
                  </span>
                </TableCell>
                <TableCell className={cellClass}>{formatDuration(tool.durationP95Ms)}</TableCell>
                <TableCell className={cellClass}>
                  <ErrorRate value={tool.errorRate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </BreakdownCard>
  );
}
