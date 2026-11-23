import type { Metrics, MetricsRangePreset } from "@lens/contracts";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@lens/ui/components/table";
import { Link } from "@tanstack/react-router";
import { formatDecimal, formatDuration, formatNumber } from "../utils/observability-view";
import { BreakdownCard, cellClass, ErrorRate, ShareBar, Th, TitleTh } from "./breakdown-table";

export function ModelBreakdownCard(props: {
  metrics: Metrics;
  projectId: string;
  range: MetricsRangePreset;
}) {
  return (
    <BreakdownCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TitleTh
              title="Model efficiency"
              description="Usage, duration, and reliability by generation model"
            />
            <Th className="text-right">Gens</Th>
            <Th className="text-right">Token share</Th>
            <Th className="text-right">In / out</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Tok / gen</Th>
            <Th className="text-right">P95 duration</Th>
            <Th className="text-right">Errors</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.metrics.models.map((model) => (
            <TableRow key={model.model ?? "unknown"}>
              <TableCell className="py-1 font-medium first:pl-(--card-spacing)">
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
              <TableCell className={cellClass}>{formatNumber(model.generations)}</TableCell>
              <TableCell className={cellClass}>
                <ShareBar value={model.tokenShare} />
              </TableCell>
              <TableCell className={cellClass}>
                {formatNumber(model.inputTokens)}
                <span className="text-muted-foreground"> / {formatNumber(model.outputTokens)}</span>
              </TableCell>
              <TableCell className={cellClass}>{formatNumber(model.totalTokens)}</TableCell>
              <TableCell className={cellClass}>
                {formatDecimal(model.tokensPerGeneration)}
              </TableCell>
              <TableCell className={cellClass}>{formatDuration(model.durationP95Ms)}</TableCell>
              <TableCell className={cellClass}>
                <ErrorRate value={model.errorRate} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </BreakdownCard>
  );
}
