import { z } from "zod";

import type { TraceSummary } from "./telemetry.js";

export const metricsRangePresets = ["24h", "7d", "30d"] as const;
export type MetricsRangePreset = (typeof metricsRangePresets)[number];
export type MetricsBucket = "hour" | "6hours" | "day";

export type MetricPoint = {
  timestamp: string;
  traces: number;
  traceErrors: number;
  generations: number;
  inputTokens: number;
  outputTokens: number;
  generationDurationP50Ms: number | null;
  generationDurationP95Ms: number | null;
};

export type MetricsSummary = {
  traces: number;
  spans: number;
  generations: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  tokensPerGeneration: number;
  generationDurationP50Ms: number;
  generationDurationP95Ms: number;
  activeModels: number;
  activeUsers: number;
  activeSessions: number;
};

export type ModelMetrics = {
  model: string | null;
  generations: number;
  errors: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenShare: number;
  tokensPerGeneration: number;
  durationP95Ms: number;
};

export type ServiceMetrics = {
  serviceName: string;
  traces: number;
  generations: number;
  errors: number;
  errorRate: number;
  totalTokens: number;
  durationP95Ms: number;
};

export type ToolMetrics = {
  toolName: string;
  calls: number;
  errors: number;
  errorRate: number;
  durationP95Ms: number;
};

export type Metrics = {
  range: {
    preset: MetricsRangePreset;
    bucket: MetricsBucket;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  current: MetricsSummary;
  previous: MetricsSummary;
  series: MetricPoint[];
  models: ModelMetrics[];
  services: ServiceMetrics[];
  tools: ToolMetrics[];
  topTokenTraces: TraceSummary[];
  recentErrors: TraceSummary[];
};

export const metricsRangeSchema = z.enum(metricsRangePresets);
