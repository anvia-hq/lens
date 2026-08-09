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
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
              label="P95 generation latency"
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
                <BarChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis tickFormatter={formatCompactAxis} tickLine={false} axisLine={false} />
                  {metricsTooltip(search.range)}
                  <Bar dataKey="inputTokens" stackId="tokens" fill="var(--color-inputTokens)" />
                  <Bar
                    dataKey="outputTokens"
                    stackId="tokens"
                    fill="var(--color-outputTokens)"
                    radius={[3, 3, 0, 0]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Throughput and errors"
              description="Traces and LLM generations, with failed traces highlighted"
            >
              <ChartContainer className="h-72 w-full" config={throughputChartConfig}>
                <BarChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  {metricsTooltip(search.range)}
                  <Bar
                    dataKey="generations"
                    fill="var(--color-generations)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar dataKey="traces" fill="var(--color-traces)" radius={[3, 3, 0, 0]} />
                  <Bar
                    dataKey="traceErrors"
                    fill="var(--color-traceErrors)"
                    radius={[3, 3, 0, 0]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            </OverviewChartCard>

            <OverviewChartCard
              title="Generation latency"
              description="P50 and P95 latency for generation observations"
            >
              <ChartContainer className="h-72 w-full" config={latencyChartConfig}>
                <BarChart data={value.series} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  {metricsXAxis(search.range)}
                  <YAxis
                    tickFormatter={(item) => formatDuration(Number(item))}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                  />
                  {metricsTooltip(search.range, true)}
                  <Bar
                    dataKey="generationDurationP95Ms"
                    fill="var(--color-generationDurationP95Ms)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="generationDurationP50Ms"
                    fill="var(--color-generationDurationP50Ms)"
                    radius={[3, 3, 0, 0]}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
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
