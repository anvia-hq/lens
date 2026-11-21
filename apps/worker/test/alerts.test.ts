import type { EvaluateAlertsJob } from "@lens/contracts";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbFunctions = vi.hoisted(() => ({
  autoResolveAlertIncident: vi.fn(),
  listEnabledAlertRules: vi.fn(),
  openAlertIncident: vi.fn(),
  queryAlertMeasurement: vi.fn(),
  updateAlertRuleState: vi.fn(),
}));

vi.mock("@lens/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lens/db")>()),
  ...dbFunctions,
}));

import { createAlertProcessor } from "../src/alerts.js";
import type { ProcessorDependencies } from "../src/processors.js";

describe("alert processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens an incident on the second consecutive threshold breach", async () => {
    const rule = {
      id: "rule-1",
      projectId: "10000000-0000-4000-8000-000000000001",
      name: "Production duration",
      kind: "trace_p95_latency_ms",
      enabled: true,
      threshold: 500,
      windowMinutes: 15,
      minimumSamples: 20,
      consecutiveBreaches: 1,
      cooldownUntil: null,
      channelIds: [],
    };
    dbFunctions.listEnabledAlertRules.mockResolvedValue([rule]);
    dbFunctions.queryAlertMeasurement.mockResolvedValue({
      value: 800,
      sampleCount: 25,
      evidence: { traceIds: ["trace-1"] },
    });
    dbFunctions.openAlertIncident.mockResolvedValue({
      incidentId: "20000000-0000-4000-8000-000000000009",
      created: true,
    });
    const deps = {
      postgres: { db: {} },
      clickhouse: {},
    } as unknown as ProcessorDependencies;

    await createAlertProcessor(deps)({ data: {} } as Job<EvaluateAlertsJob>);

    expect(dbFunctions.updateAlertRuleState).toHaveBeenCalledWith(
      deps.postgres.db,
      "rule-1",
      expect.objectContaining({ consecutiveBreaches: 2 }),
    );
    expect(dbFunctions.openAlertIncident).toHaveBeenCalledWith(
      deps.postgres.db,
      rule,
      expect.objectContaining({
        subjectKey: "threshold",
        summary: "P95 trace duration is 800 ms (threshold 500 ms)",
        observedValue: 800,
        sampleCount: 25,
      }),
      expect.any(Date),
    );
  });

  it("isolates failing rules and skips recently evaluated rules to avoid double-counting", async () => {
    const baseRule = {
      projectId: "10000000-0000-4000-8000-000000000001",
      kind: "trace_error_rate" as const,
      enabled: true,
      threshold: 0.1,
      windowMinutes: 15,
      minimumSamples: 5,
      consecutiveBreaches: 1,
      cooldownUntil: null,
      channelIds: [],
    };
    const failingRule = { ...baseRule, id: "rule-fail", name: "Failing", lastEvaluatedAt: null };
    const recentRule = {
      ...baseRule,
      id: "rule-recent",
      name: "Recent",
      lastEvaluatedAt: new Date(Date.now() - 10_000).toISOString(),
    };
    const healthyRule = { ...baseRule, id: "rule-ok", name: "Healthy", lastEvaluatedAt: null };

    dbFunctions.listEnabledAlertRules.mockResolvedValue([failingRule, recentRule, healthyRule]);
    dbFunctions.queryAlertMeasurement
      .mockRejectedValueOnce(new Error("clickhouse timeout"))
      .mockResolvedValueOnce({ value: 0.01, sampleCount: 20, evidence: { traceIds: [] } });
    dbFunctions.autoResolveAlertIncident.mockResolvedValue(false);

    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    const deps = {
      postgres: { db: {} },
      clickhouse: {},
      logger,
    } as unknown as ProcessorDependencies;

    await createAlertProcessor(deps)({ data: {} } as Job<EvaluateAlertsJob>);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "rule-fail" }),
      "failed to evaluate alert rule",
    );
    expect(dbFunctions.queryAlertMeasurement).toHaveBeenCalledTimes(2);
    expect(dbFunctions.updateAlertRuleState).toHaveBeenCalledWith(
      deps.postgres.db,
      "rule-ok",
      expect.objectContaining({ consecutiveBreaches: 0 }),
    );
  });
});
