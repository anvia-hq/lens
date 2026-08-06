import type { Metrics, MetricsRangePreset } from "@lens/contracts";
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
import { Link } from "@tanstack/react-router";
import {
  formatDecimal,
  formatDuration,
  formatNumber,
  formatPercent,
} from "../utils/observability-view";

export function ModelBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <Card className="xl:col-span-3">
      <CardHeader>
        <CardTitle>Model efficiency</CardTitle>
        <CardDescription>Usage, latency, and reliability by generation model</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Generations</TableHead>
                <TableHead className="text-right">Token share</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Tokens / gen</TableHead>
                <TableHead className="text-right">P95</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.metrics.models.map((model) => (
                <TableRow key={model.model ?? "unknown"}>
                  <TableCell className="font-medium">
                    {model.model ? (
                      <Link
                        className="hover:underline"
                        to="/$projectId/traces"
                        params={{ projectId: props.projectId }}
                        search={{ range: props.range, models: [model.model] }}
                      >
                        {model.model}
                      </Link>
                    ) : (
                      "Unknown model"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.generations)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(model.tokenShare)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(model.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDecimal(model.tokensPerGeneration)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDuration(model.durationP95Ms)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(model.errorRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
