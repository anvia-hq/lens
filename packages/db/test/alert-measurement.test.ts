import type { AlertIncident, AlertRuleInput } from "@lens/contracts";
import { describe, expect, it, vi } from "vitest";
import { queryAlertSignalSeries, resolveAlertSignalRange } from "../src/alert-measurement.js";
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
});
