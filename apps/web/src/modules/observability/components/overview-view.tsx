import { buttonVariants } from "@lens/ui/components/button";
import { Card, CardContent } from "@lens/ui/components/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@lens/ui/components/chart";
import {
  Pulse as Activity,
  WarningCircle as AlertCircle,
  Clock as Clock3,
  Database,
  CurrencyDollar as DollarSign,
  Stack as Layers3,
  Chats as MessagesSquare,
  Sparkle as Sparkles,
  Lightning as Zap,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { OverviewState } from "../hooks/use-overview";
import {
  formatCompactAxis,
  formatCost,
  formatDecimal,
  formatDuration,
  formatNumber,
  formatPercent,
  latencyChartConfig,
  metricsTooltip,
  metricsXAxis,
  modelChartConfig,
  throughputChartConfig,
  tokenChartConfig,
  truncateChartLabel,
} from "../utils/observability-view";
import { ComparisonMetricCard } from "./comparison-metric-card";
import { LiveBadge } from "./live-badge";
import { ModelBreakdownCard } from "./model-breakdown-card";
import { OverviewChartCard } from "./overview-chart-card";
import { OverviewSkeleton } from "./overview-skeleton";
import { RangeSelector } from "./range-selector";
import { ServiceBreakdownCard } from "./service-breakdown-card";
import { ToolHealthCard } from "./tool-health-card";
import { TraceRankingCard } from "./trace-ranking-card";

export function OverviewView({ state }: { state: OverviewState }) {
  const { metrics, project, refreshInterval, search, setRange, setRefreshInterval, value } = state;
  return (
    <Page
      title="Overview"
      description={
        value
          ? `${formatNumber(value.current.spans)} spans · ${formatNumber(value.current.activeUsers)} active users in this window`
          : "LLM usage, model efficiency, and operational health"
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <RangeSelector value={search.range} onChange={setRange} />
          <LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />
        </div>
      }
    >
      {metrics.isLoading ? (
        <OverviewSkeleton />
      ) : metrics.isError ? (
        <ErrorAlert error={metrics.error} />
      ) : !value || value.current.traces === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Sparkles />}
              title="Waiting for your first trace"
              text="Connect a Langfuse or OpenTelemetry exporter and activity will appear here."
              action={
                <Link
                  className={buttonVariants()}
                  to="/$projectId/connect"
                  params={{ projectId: project.id }}
                >
                  Connect an app
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ComparisonMetricCard
              label="Total tokens"
              value={formatNumber(value.current.totalTokens)}
              current={value.current.totalTokens}
              previous={value.previous.totalTokens}
              icon={<Zap />}
            />
            <ComparisonMetricCard
              label="Total cost"
              value={formatCost(value.current.totalCost)}
              current={value.current.totalCost}
              previous={value.previous.totalCost}
              icon={<DollarSign />}
            />
            <ComparisonMetricCard
              label="Tokens / generation"
              value={formatDecimal(value.current.tokensPerGeneration)}
              current={value.current.tokensPerGeneration}
              previous={value.previous.tokensPerGeneration}
              icon={<Layers3 />}
            />
            <ComparisonMetricCard
              label="Active models"
              value={formatNumber(value.current.activeModels)}
              current={value.current.activeModels}
              previous={value.previous.activeModels}
              icon={<Database />}
            />
            <ComparisonMetricCard
              label="Traces"
              value={formatNumber(value.current.traces)}
              current={value.current.traces}
              previous={value.previous.traces}
              icon={<Activity />}
            />
            <ComparisonMetricCard
              label="Error rate"
              value={formatPercent(value.current.errorRate)}
              current={value.current.errorRate}
              previous={value.previous.errorRate}
              deltaMode="points"
              lowerIsBetter
              icon={<AlertCircle />}
            />
            <ComparisonMetricCard
              label="P95 generation duration"
              value={formatDuration(value.current.generationDurationP95Ms)}
              current={value.current.generationDurationP95Ms}
              previous={value.previous.generationDurationP95Ms}
              lowerIsBetter
              icon={<Clock3 />}
            />
            <ComparisonMetricCard
              label="Active sessions"
              value={formatNumber(value.current.activeSessions)}
              current={value.current.activeSessions}
              previous={value.previous.activeSessions}
              icon={<MessagesSquare />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <OverviewChartCard title="Token usage" description="Input and output tokens over time">
              <ChartContainer className="h-72 w-full" config={tokenChartConfig}>
                <AreaChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <defs>
                    <OverviewAreaGradient
                      id="overview-input-tokens-gradient"
                      color="var(--color-inputTokens)"
                    />
                    <OverviewAreaGradient
                      id="overview-output-tokens-gradient"
                      color="var(--color-outputTokens)"
                    />
                  </defs>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis
                    tickFormatter={formatCompactAxis}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  {metricsTooltip(search.range)}
                  <Area
                    dataKey="inputTokens"
                    type="linear"
                    stroke="var(--color-inputTokens)"
                    strokeWidth={1.75}
                    fill="url(#overview-input-tokens-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <Area
                    dataKey="outputTokens"
                    type="linear"
                    stroke="var(--color-outputTokens)"
                    strokeWidth={1.5}
                    fill="url(#overview-output-tokens-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Throughput and errors"
              description="Traces and LLM generations, with failed traces highlighted"
            >
              <ChartContainer className="h-72 w-full" config={throughputChartConfig}>
                <AreaChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <defs>
                    <OverviewAreaGradient
                      id="overview-generations-gradient"
                      color="var(--color-generations)"
                    />
                    <OverviewAreaGradient
                      id="overview-traces-gradient"
                      color="var(--color-traces)"
                    />
                    <OverviewAreaGradient
                      id="overview-trace-errors-gradient"
                      color="var(--color-traceErrors)"
                    />
                  </defs>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  {metricsTooltip(search.range)}
                  <Area
                    dataKey="generations"
                    type="linear"
                    stroke="var(--color-generations)"
                    strokeWidth={1.5}
                    fill="url(#overview-generations-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <Area
                    dataKey="traces"
                    type="linear"
                    stroke="var(--color-traces)"
                    strokeWidth={1.75}
                    fill="url(#overview-traces-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <Area
                    dataKey="traceErrors"
                    type="linear"
                    stroke="var(--color-traceErrors)"
                    strokeWidth={1.25}
                    strokeDasharray="4 4"
                    fill="url(#overview-trace-errors-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Generation duration"
              description="P50 and P95 duration for generation observations"
            >
              <ChartContainer className="h-72 w-full" config={latencyChartConfig}>
                <AreaChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <defs>
                    <OverviewAreaGradient
                      id="overview-duration-p95-gradient"
                      color="var(--color-generationDurationP95Ms)"
                    />
                    <OverviewAreaGradient
                      id="overview-duration-p50-gradient"
                      color="var(--color-generationDurationP50Ms)"
                    />
                  </defs>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis
                    tickFormatter={(item) => formatDuration(Number(item))}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                  />
                  {metricsTooltip(search.range, true)}
                  <Area
                    dataKey="generationDurationP95Ms"
                    type="linear"
                    stroke="var(--color-generationDurationP95Ms)"
                    strokeWidth={1.75}
                    fill="url(#overview-duration-p95-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <Area
                    dataKey="generationDurationP50Ms"
                    type="linear"
                    stroke="var(--color-generationDurationP50Ms)"
                    strokeWidth={1.5}
                    fill="url(#overview-duration-p50-gradient)"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Tokens by model"
              description="Share of total generation tokens"
            >
              <ChartContainer className="h-72 w-full" config={modelChartConfig}>
                <BarChart
                  data={value.models.map((model) => ({
                    ...model,
                    label: model.model ?? "Unknown model",
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 20 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={formatCompactAxis}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    dataKey="label"
                    type="category"
                    width={118}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={truncateChartLabel}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(item) => formatNumber(Number(item))} />
                    }
                  />
                  <Bar dataKey="totalTokens" fill="var(--color-totalTokens)" radius={4} />
                </BarChart>
              </ChartContainer>
            </OverviewChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <ModelBreakdownCard metrics={value} projectId={project.id} range={search.range} />
            <ServiceBreakdownCard metrics={value} projectId={project.id} range={search.range} />
            <ToolHealthCard metrics={value} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TraceRankingCard
              title="Token-heavy traces"
              description="Highest token usage in this window"
              traces={value.topTokenTraces}
              projectId={project.id}
            />
            <TraceRankingCard
              title="Recent failures"
              description="Latest traces with an error"
              traces={value.recentErrors}
              projectId={project.id}
              emptyText="No failed traces in this window."
            />
          </div>
        </>
      )}
    </Page>
  );
}

function OverviewAreaGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.24} />
      <stop offset="72%" stopColor={color} stopOpacity={0.06} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}
