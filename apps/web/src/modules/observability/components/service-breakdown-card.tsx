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
import { formatDuration, formatNumber, formatPercent } from "../utils/observability-view";

export function ServiceBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>Token load and trace health by service</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Traces</TableHead>
                <TableHead className="text-right">Generations</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">P95 trace duration</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.metrics.services.map((service) => (
                <TableRow key={service.serviceName}>
                  <TableCell className="max-w-48 font-medium">
                    <Link
                      className="block truncate hover:underline"
                      to="/$projectId/traces"
                      params={{ projectId: props.projectId }}
                      search={{ range: props.range, services: [service.serviceName] }}
                    >
                      {service.serviceName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.traces)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.generations)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(service.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDuration(service.durationP95Ms)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(service.errorRate)}
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
