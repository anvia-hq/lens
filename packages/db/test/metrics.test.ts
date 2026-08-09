import type { ClickHouseClient } from "@clickhouse/client";
import { describe, expect, it, vi } from "vitest";
import { queryMetrics } from "../src/metrics-store.js";
import { clickHouseClient } from "./clickhouse-client.js";

const now = new Date("2026-08-05T12:30:00.000Z");

describe("overview metrics", () => {
  it("maps current and previous analytics into a zero-filled dashboard response", async () => {
    const client = metricsClient({ populated: true });
    const metrics = await queryMetrics(client, "11111111-1111-4111-8111-111111111111", "24h", now);

    expect(metrics.range).toEqual({
      preset: "24h",
      bucket: "hour",
      from: "2026-08-04T12:30:00.000Z",
      to: "2026-08-05T12:30:00.000Z",
      previousFrom: "2026-08-03T12:30:00.000Z",
      previousTo: "2026-08-04T12:30:00.000Z",
    });
    expect(metrics.current).toMatchObject({
      traces: 12,
      spans: 84,
      generations: 36,
      errors: 2,
      totalTokens: 9_000,
      totalCost: 1.25,
      tokensPerGeneration: 250,
      generationDurationP95Ms: 850,
      activeModels: 2,
      activeUsers: 5,
      activeSessions: 7,
    });
    expect(metrics.previous).toMatchObject({
      traces: 8,
      generations: 20,
      totalTokens: 4_000,
      totalCost: 0.5,
    });
    expect(metrics.series).toHaveLength(25);
    expect(metrics.series.find((point) => point.timestamp === "2026-08-05T11:00:00.000Z")).toEqual({
      timestamp: "2026-08-05T11:00:00.000Z",
      traces: 3,
      traceErrors: 1,
      generations: 9,
      inputTokens: 1_200,
      outputTokens: 300,
      generationDurationP50Ms: 300,
      generationDurationP95Ms: 700,
    });
    expect(metrics.models).toEqual([
      expect.objectContaining({
        model: "gpt-4.1-mini",
        generations: 24,
        totalTokens: 6_000,
        tokenShare: 2 / 3,
        tokensPerGeneration: 250,
      }),
      expect.objectContaining({ model: null, totalTokens: 3_000, tokenShare: 1 / 3 }),
    ]);
    expect(metrics.services[0]).toMatchObject({
      serviceName: "support-agent",
      traces: 12,
      generations: 36,
      errorRate: 1 / 6,
    });
    expect(metrics.tools).toEqual([
      {
        toolName: "search",
        calls: 10,
        errors: 2,
        errorRate: 0.2,
        durationP95Ms: 420,
      },
    ]);
  });

  it("returns safe zero summaries and nullable latency for an empty range", async () => {
    const metrics = await queryMetrics(
      metricsClient({ populated: false }),
      "11111111-1111-4111-8111-111111111111",
      "7d",
      now,
    );

    expect(metrics.range.bucket).toBe("6hours");
    expect(metrics.current).toMatchObject({
      traces: 0,
      generations: 0,
      errorRate: 0,
      tokensPerGeneration: 0,
      generationDurationP95Ms: 0,
    });
    expect(metrics.series).toHaveLength(29);
    expect(metrics.series.every((point) => point.generationDurationP95Ms === null)).toBe(true);
    expect(metrics.models).toEqual([]);
    expect(metrics.tools).toEqual([]);
    expect(metrics.topTokenTraces).toEqual([]);
  });
});

function metricsClient(options: { populated: boolean }): ClickHouseClient {
  return clickHouseClient({
    query: vi.fn(async ({ query }: { query: string }) => ({
      json: async () => responseForQuery(query, options.populated),
    })),
  });
}

function responseForQuery(query: string, populated: boolean): unknown[] {
  if (!populated) return [];
  if (query.includes("GROUP BY period") && query.includes("trace_summaries")) {
    return [
      {
        period: "current",
        traces: 12,
        spans: 84,
        errors: 2,
        input_tokens: 7_000,
        output_tokens: 2_000,
        total_tokens: 9_000,
        total_cost: 1.25,
        active_users: 5,
        active_sessions: 7,
      },
      {
        period: "previous",
        traces: 8,
        spans: 50,
        errors: 1,
        input_tokens: 3_000,
        output_tokens: 1_000,
        total_tokens: 4_000,
        total_cost: 0.5,
        active_users: 3,
        active_sessions: 4,
      },
    ];
  }
  if (query.includes("GROUP BY period") && query.includes("FROM spans")) {
    return [
      { period: "current", generations: 36, errors: 1, p50: 350, p95: 850, active_models: 2 },
      { period: "previous", generations: 20, errors: 2, p50: 400, p95: 1_000, active_models: 1 },
    ];
  }
  if (query.includes("GROUP BY timestamp") && query.includes("trace_summaries")) {
    return [
      {
        timestamp: "2026-08-05 11:00:00",
        traces: 3,
        errors: 1,
        generations: 9,
        input_tokens: 1_200,
        output_tokens: 300,
      },
    ];
  }
  if (query.includes("GROUP BY timestamp") && query.includes("FROM spans")) {
    return [{ timestamp: "2026-08-05 11:00:00", p50: 300, p95: 700 }];
  }
  if (query.includes("GROUP BY model")) {
    return [
      {
        model: "gpt-4.1-mini",
        generations: 24,
        errors: 1,
        input_tokens: 4_800,
        output_tokens: 1_200,
        total_tokens: 6_000,
        p95: 800,
      },
      {
        model: null,
        generations: 12,
        errors: 0,
        input_tokens: 2_200,
        output_tokens: 800,
        total_tokens: 3_000,
        p95: 600,
      },
    ];
  }
  if (query.includes("GROUP BY service_name")) {
    return [
      {
        service_name: "support-agent",
        traces: 12,
        generations: 36,
        errors: 2,
        total_tokens: 9_000,
        p95: 2_500,
      },
    ];
  }
  if (query.includes("observation_kind = 'tool'")) {
    return [{ tool_name: "search", calls: 10, errors: 2, p95: 420 }];
  }
  return [];
}
