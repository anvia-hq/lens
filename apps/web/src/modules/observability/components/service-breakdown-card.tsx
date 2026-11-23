import type { Metrics, MetricsRangePreset } from "@lens/contracts";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@lens/ui/components/table";
import { Link } from "@tanstack/react-router";
import { formatDuration, formatNumber } from "../utils/observability-view";
import { BreakdownCard, cellClass, ErrorRate, Th, TitleTh } from "./breakdown-table";

export function ServiceBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <BreakdownCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TitleTh title="Services" description="Token load and trace health by service" />
            <Th className="text-right">Traces</Th>
            <Th className="text-right">Gens</Th>
            <Th className="text-right">Tokens</Th>
            <Th className="text-right">P95 duration</Th>
            <Th className="text-right">Errors</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.metrics.services.map((service) => (
            <TableRow key={service.serviceName}>
              <TableCell className="max-w-48 py-1 font-medium first:pl-(--card-spacing)">
                <Link
                  className="block truncate hover:underline"
                  to="/$projectId/traces"
                  params={{ projectId: props.projectId }}
                  search={{ range: props.range, services: [service.serviceName] }}
                >
                  {service.serviceName}
                </Link>
              </TableCell>
              <TableCell className={cellClass}>{formatNumber(service.traces)}</TableCell>
              <TableCell className={cellClass}>{formatNumber(service.generations)}</TableCell>
              <TableCell className={cellClass}>{formatNumber(service.totalTokens)}</TableCell>
              <TableCell className={cellClass}>{formatDuration(service.durationP95Ms)}</TableCell>
              <TableCell className={cellClass}>
                <ErrorRate value={service.errorRate} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </BreakdownCard>
  );
}
