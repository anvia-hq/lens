import type { EvaluationOverview } from "@lens/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@lens/ui/components/chart";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lens/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import type { UseQueryResult } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ErrorAlert } from "../../../components/error-alert";
import { formatNumber } from "../utils/trace-detail";

const chartConfig = {
  passed: { label: "Passed", color: "var(--chart-2)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  invalid: { label: "Invalid", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function EvaluationOverviewDrawer(props: {
  open: boolean;
  overview: UseQueryResult<EvaluationOverview>;
  onOpenChange: (open: boolean) => void;
}) {
  const data = props.overview.data;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Quality overview</SheetTitle>
          <SheetDescription>
            Evaluation health for the selected range, suites, environments, and releases.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {props.overview.error ? <ErrorAlert error={props.overview.error} /> : null}
            {!data ? (
              <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
                Loading quality overview…
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="Results" value={formatNumber(data.summary.results)} />
                  <SummaryCard
                    label="Pass rate"
                    value={`${(data.summary.passRate * 100).toFixed(1)}%`}
                  />
                  <SummaryCard label="Failed" value={formatNumber(data.summary.failed)} />
                  <SummaryCard
                    label="Evaluated traces"
                    value={formatNumber(data.summary.evaluatedTraces)}
                  />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Quality trend</CardTitle>
                    <CardDescription>Evaluation outcomes over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer className="h-64 w-full" config={chartConfig}>
                      <BarChart data={data.series} margin={{ left: 0, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(value) =>
                            new Date(String(value)).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: data.range.preset === "24h" ? "numeric" : undefined,
                            })
                          }
                          tickLine={false}
                          axisLine={false}
                          minTickGap={24}
                        />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="passed" stackId="outcomes" fill="var(--color-passed)" />
                        <Bar dataKey="failed" stackId="outcomes" fill="var(--color-failed)" />
                        <Bar
                          dataKey="invalid"
                          stackId="outcomes"
                          fill="var(--color-invalid)"
                          radius={[3, 3, 0, 0]}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <BreakdownTable
                  title="Metrics"
                  nameLabel="Metric"
                  rows={data.metrics.map((item) => ({ name: item.metricName, ...item }))}
                />
                <BreakdownTable
                  title="Suites"
                  nameLabel="Suite"
                  rows={data.suites.map((item) => ({ name: item.suiteName, ...item }))}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-xs text-muted-foreground">{props.label}</span>
        <span className="font-heading text-2xl font-medium tabular-nums">{props.value}</span>
      </CardContent>
    </Card>
  );
}

function BreakdownTable(props: {
  title: string;
  nameLabel: string;
  rows: Array<{ name: string; results: number; passRate: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{props.nameLabel}</TableHead>
            <TableHead>Results</TableHead>
            <TableHead className="pr-4">Pass rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.slice(0, 12).map((row) => (
            <TableRow key={row.name}>
              <TableCell className="pl-4 font-medium">{row.name}</TableCell>
              <TableCell>{formatNumber(row.results)}</TableCell>
              <TableCell className="pr-4">{(row.passRate * 100).toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
