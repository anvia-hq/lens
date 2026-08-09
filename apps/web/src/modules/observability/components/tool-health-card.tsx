import type { Metrics } from "@lens/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { formatDuration, formatNumber, formatPercent } from "../utils/observability-view";

export function ToolHealthCard({ metrics }: { metrics: Metrics }) {
  return (
    <Card className="xl:col-span-5">
      <CardHeader>
        <CardTitle>Tool health</CardTitle>
        <CardDescription>Most-used tool calls, latency, and failures</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {metrics.tools.length === 0 ? (
          <p className="px-6 pb-2 text-sm text-muted-foreground">No tool calls in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">P95</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.tools.map((tool) => (
                  <TableRow key={tool.toolName}>
                    <TableCell className="max-w-80 truncate font-medium">{tool.toolName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(tool.calls)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatDuration(tool.durationP95Ms)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPercent(tool.errorRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
