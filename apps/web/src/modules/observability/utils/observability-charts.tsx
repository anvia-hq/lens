import type { MetricsRangePreset } from "@lens/contracts";
import { type ChartConfig, ChartTooltip, ChartTooltipContent } from "@lens/ui/components/chart";
import { XAxis } from "recharts";
import { formatDuration, formatMetricTimestamp, formatNumber } from "./observability-view";

export const throughputChartConfig = {
  traces: { label: "Traces", color: "var(--viz-indigo)" },
  generations: { label: "Generations", color: "var(--viz-indigo-muted)" },
  traceErrors: { label: "Errors", color: "var(--viz-neutral)" },
} satisfies ChartConfig;

export const tokenChartConfig = {
  inputTokens: { label: "Input tokens", color: "var(--viz-indigo)" },
  outputTokens: { label: "Output tokens", color: "var(--viz-neutral)" },
} satisfies ChartConfig;

export const latencyChartConfig = {
  generationDurationP50Ms: { label: "P50", color: "var(--viz-neutral)" },
  generationDurationP95Ms: { label: "P95", color: "var(--viz-indigo)" },
} satisfies ChartConfig;

export const modelChartConfig = {
  totalTokens: { label: "Total tokens", color: "var(--viz-indigo)" },
} satisfies ChartConfig;

export function metricsXAxis(range: MetricsRangePreset) {
  return (
    <XAxis
      dataKey="timestamp"
      tickFormatter={(item) => formatMetricTimestamp(String(item), range, false)}
      minTickGap={24}
      tickLine={false}
      axisLine={false}
    />
  );
}

export function metricsTooltip(range: MetricsRangePreset, duration = false) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_label, payload) =>
            formatMetricTimestamp(String(payload[0]?.payload?.timestamp ?? ""), range, true)
          }
          formatter={(item) =>
            duration ? formatDuration(Number(item)) : formatNumber(Number(item))
          }
        />
      }
    />
  );
}
