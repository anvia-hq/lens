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
      name: "Production errors",
      kind: "trace_error_rate",
      enabled: true,
      threshold: 0.05,
      windowMinutes: 15,
      minimumSamples: 20,
      consecutiveBreaches: 1,
      cooldownUntil: null,
    };
    dbFunctions.listEnabledAlertRules.mockResolvedValue([rule]);
    dbFunctions.queryAlertMeasurement.mockResolvedValue({
      value: 0.08,
      sampleCount: 25,
      evidence: { traceIds: ["trace-1"] },
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
      expect.objectContaining({ subjectKey: "threshold", observedValue: 0.08, sampleCount: 25 }),
      expect.any(Date),
    );
  });
});
