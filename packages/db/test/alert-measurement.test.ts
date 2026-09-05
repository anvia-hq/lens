import type { AlertIncident, AlertRuleInput } from "@lens/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  queryAlertContributorAnalysis,
  queryAlertMeasurement,
  queryAlertSignalSeries,
  resolveAlertContributorRange,
  resolveAlertSignalRange,
} from "../src/alert-measurement.js";
import { clickHouseClient } from "./clickhouse-client.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const incident = {
  id: "20000000-0000-4000-8000-000000000001",
  projectId,
  ruleId: "30000000-0000-4000-8000-000000000001",
  ruleName: "Tool failures",
  kind: "tool_error_rate",
  status: "open",
  summary: "Tool error rate breached",
  observedValue: 0.2,
  threshold: 0.1,
  sampleCount: 25,
  evidence: {},
  firstTriggeredAt: "2026-08-09T10:00:00.000Z",
  lastTriggeredAt: "2026-08-09T10:01:00.000Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  resolution: null,
} satisfies AlertIncident;

describe("alert signal history", () => {
  it("caps long-running incidents at 24 hours with five-minute buckets", () => {
    expect(
      resolveAlertSignalRange(
        15,
        { ...incident, firstTriggeredAt: "2026-08-07T10:00:00.000Z" },
        new Date("2026-08-09T12:00:00.000Z"),
      ),
    ).toEqual({
      from: "2026-08-08T12:00:00.000Z",
      to: "2026-08-09T12:00:00.000Z",
      bucketMinutes: 5,
    });
  });

  it("queries exact tool scope and fills missing one-minute buckets", async () => {
    const query = vi.fn(async () => ({
      json: async () => [{ timestamp: "2026-08-09 11:59:00", samples: 5, value: 0.2 }],
    }));
    const rule = {
      name: "Tool failures",
      enabled: true,
      channelIds: [],
      kind: "tool_error_rate",
      threshold: 0.1,
      windowMinutes: 15,
      minimumSamples: 20,
      environment: "production",
      serviceName: "api",
      toolName: "search",
    } satisfies AlertRuleInput;

    const series = await queryAlertSignalSeries(
      clickHouseClient({ query }),
      projectId,
      rule,
      incident,
      new Date("2026-08-09T12:00:00.000Z"),
    );

    expect(series).toMatchObject({
      from: "2026-08-09T09:00:00.000Z",
      to: "2026-08-09T12:00:00.000Z",
      bucketMinutes: 1,
    });
    expect(series?.points).toHaveLength(181);
    expect(series?.points.at(-2)).toEqual({
      timestamp: "2026-08-09T11:59:00.000Z",
      value: 0.2,
      sampleCount: 5,
    });
    expect(series?.points[0]).toEqual({
      timestamp: "2026-08-09T09:00:00.000Z",
      value: null,
      sampleCount: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("observation_kind = 'tool'"),
        query_params: expect.objectContaining({
          environment: "production",
          serviceName: "api",
          toolName: "search",
        }),
      }),
    );
  });

  it("measures scoped tool errors and keeps their trace evidence", async () => {
    const query = vi.fn(async () => ({
      json: async () => [{ samples: 10, errors: 2, trace_ids: ["trace-1", "trace-2"] }],
    }));

    const measurement = await queryAlertMeasurement(
      clickHouseClient({ query }),
      {
        id: "30000000-0000-4000-8000-000000000001",
        projectId,
        name: "Tool failures",
        enabled: true,
        channelIds: [],
        kind: "tool_error_rate",
        threshold: 0.1,
        windowMinutes: 15,
        minimumSamples: 5,
        environment: "production",
        serviceName: "api",
        toolName: "search",
        lastEvaluatedAt: null,
        createdAt: incident.firstTriggeredAt,
        updatedAt: incident.firstTriggeredAt,
        consecutiveBreaches: 0,
        cooldownUntil: null,
      },
      new Date(incident.firstTriggeredAt),
    );

    expect(measurement).toEqual({
      value: 0.2,
      sampleCount: 10,
      evidence: { traceIds: ["trace-1", "trace-2"] },
    });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("observation_kind = 'tool'"),
        query_params: expect.objectContaining({ toolName: "search" }),
      }),
    );
  });
});

describe("alert contributor analysis", () => {
  it("uses fixed adjacent windows and surfaces a material new release", async () => {
    expect(resolveAlertContributorRange(15, incident)).toEqual({
      baselineFrom: "2026-08-09T09:30:00.000Z",
      baselineTo: "2026-08-09T09:45:00.000Z",
      breachFrom: "2026-08-09T09:45:00.000Z",
      breachTo: "2026-08-09T10:00:00.000Z",
    });
    const query = vi.fn(async ({ query: sql }: { query: string }) => ({
      json: async () =>
        sql.includes("trace_summaries")
          ? [
              {
                period: "baseline",
                dimension: "__all__",
                value: "__all__",
                samples: 100,
                errors: 5,
                p95: 1_000,
                trace_id: "baseline-trace",
              },
              {
                period: "breach",
                dimension: "__all__",
                value: "__all__",
                samples: 100,
                errors: 20,
                p95: 2_000,
                trace_id: "breach-trace",
              },
              {
                period: "baseline",
                dimension: "release",
                value: "v1",
                samples: 100,
                errors: 5,
                p95: 1_000,
                trace_id: "baseline-trace",
              },
              {
                period: "breach",
                dimension: "release",
                value: "v2",
                samples: 100,
                errors: 20,
                p95: 2_000,
                trace_id: "breach-trace",
              },
            ]
          : [],
    }));
    const rule = {
      name: "Trace failures",
      enabled: true,
      kind: "trace_error_rate",
      threshold: 0.1,
      windowMinutes: 15,
      minimumSamples: 20,
      environment: "production",
      serviceName: "api",
      channelIds: [],
    } satisfies AlertRuleInput;

    const analysis = await queryAlertContributorAnalysis(
      clickHouseClient({ query }),
      projectId,
      rule,
      { ...incident, kind: "trace_error_rate" },
    );

    expect(analysis).toMatchObject({
      unavailableReason: null,
      hints: [
        {
          dimension: "release",
          value: "v2",
          metric: "errorRate",
          baseline: { sampleCount: 100, value: 0.05 },
          breach: { sampleCount: 100, value: 0.2 },
          isNew: true,
          baselineTraceId: "baseline-trace",
          breachTraceId: "breach-trace",
        },
      ],
    });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query_params: expect.objectContaining({
          environment: "production",
          serviceName: "api",
          baselineFrom: "2026-08-09 09:30:00.000",
          breachFrom: "2026-08-09 09:45:00.000",
          breachTo: "2026-08-09 10:00:00.000",
        }),
      }),
    );
  });

  it("ranks material P95 duration contributors and returns only the top three", async () => {
    const rows = [
      ["baseline", "__all__", "__all__", 40, 1_000],
      ["breach", "__all__", "__all__", 40, 1_600],
      ["baseline", "release", "v1", 40, 1_000],
      ["breach", "release", "v2", 40, 1_600],
      ["baseline", "model", "gpt-4", 20, 900],
      ["baseline", "model", "gpt-5", 20, 1_000],
      ["breach", "model", "gpt-5", 40, 1_600],
      ["baseline", "service", "old-api", 40, 1_000],
      ["breach", "service", "new-api", 40, 1_600],
      ["baseline", "serviceVersion", "1.0", 40, 1_000],
      ["breach", "serviceVersion", "2.0", 40, 1_600],
    ].map(([period, dimension, value, samples, p95], index) => ({
      period,
      dimension,
      value,
      samples,
      errors: 0,
      p95,
      trace_id: `trace-${index}`,
    }));
    const query = vi.fn(async ({ query: sql }: { query: string }) => ({
      json: async () => (sql.includes("trace_summaries") ? rows : []),
    }));
    const rule = {
      name: "Slow traces",
      enabled: true,
      kind: "trace_p95_latency_ms",
      threshold: 1_500,
      windowMinutes: 15,
      minimumSamples: 20,
      environment: undefined,
      serviceName: undefined,
      channelIds: [],
    } satisfies AlertRuleInput;

    const analysis = await queryAlertContributorAnalysis(
      clickHouseClient({ query }),
      projectId,
      rule,
      { ...incident, kind: "trace_p95_latency_ms" },
    );

    expect(analysis?.hints).toHaveLength(3);
    expect(analysis?.hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "p95DurationMs",
          baseline: { sampleCount: 40, value: 1_000 },
          breach: { sampleCount: 40, value: 1_600 },
          delta: 600,
          percentChange: 0.6,
        }),
      ]),
    );
  });

  it("rejects weak regressions and excludes a scoped tool from contributor dimensions", async () => {
    const query = vi.fn(async (_options: { query: string }) => ({
      json: async () => [
        {
          period: "baseline",
          dimension: "__all__",
          value: "__all__",
          samples: 20,
          errors: 1,
          p95: 10,
          trace_id: "baseline-trace",
        },
        {
          period: "breach",
          dimension: "__all__",
          value: "__all__",
          samples: 20,
          errors: 1,
          p95: 10,
          trace_id: "breach-trace",
        },
        {
          period: "baseline",
          dimension: "service",
          value: "api",
          samples: 20,
          errors: 1,
          p95: 10,
          trace_id: "baseline-trace",
        },
        {
          period: "breach",
          dimension: "service",
          value: "api",
          samples: 20,
          errors: 1,
          p95: 10,
          trace_id: "breach-trace",
        },
      ],
    }));
    const rule = {
      name: "Tool failures",
      enabled: true,
      kind: "tool_error_rate",
      threshold: 0.1,
      windowMinutes: 15,
      minimumSamples: 20,
      toolName: "search",
      environment: undefined,
      serviceName: undefined,
      channelIds: [],
    } satisfies AlertRuleInput;

    const analysis = await queryAlertContributorAnalysis(
      clickHouseClient({ query }),
      projectId,
      rule,
      incident,
    );

    expect(analysis).toMatchObject({ hints: [], unavailableReason: "insufficient_data" });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0].query).toContain("name = {toolName:String}");
    expect(query.mock.calls[0]?.[0].query).not.toContain("('tool', toString(name))");
  });
});
