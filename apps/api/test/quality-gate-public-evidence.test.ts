import { describe, expect, it, vi } from "vitest";
import type { ApiDependencies } from "../src/utils/types.js";
import { createPublicQualityGatesRouter } from "../src/modules/quality-gates/public-router.js";

const mocks = vi.hoisted(() => ({ aggregate: vi.fn(), full: vi.fn(), gate: vi.fn() }));
vi.mock("@lens/db", () => ({
  compareEvaluationRunAggregates: mocks.aggregate,
  compareEvaluationRuns: mocks.full,
  getQualityGate: mocks.gate,
}));
vi.mock("../src/modules/ingestion/services.js", () => ({
  authenticateIngestionKey: vi.fn(async () => ({
    apiKeyId: "key",
    project: { id: "project", state: "active" },
  })),
  recordProjectKeyUsage: vi.fn(),
}));
vi.mock("../src/modules/alerts/events.js", () => ({
  recordQualityGateAlert: vi.fn(async () => {}),
}));

const evidence = { minimumValidCases: 100, maxInvalidRate: 0, maxUnknownRate: 0 };
const rule = {
  type: "evaluation_threshold",
  metricName: "correctness",
  measure: "pass_rate",
  operator: "gte",
  value: 0.95,
  evidence,
};
const metric = {
  metricName: "correctness",
  results: 100,
  passed: 1,
  failed: 0,
  invalid: 99,
  unknown: 0,
  passRate: 1,
  averageNumericValue: 1,
  validCaseCount: 1,
  validScoreCaseCount: 1,
  averageValidScore: 1,
};
const run = { status: "completed", suiteName: "suite", environment: "test", evaluatedCases: 100 };

describe("public quality gate evidence", () => {
  it("returns insufficient_data for the 1-pass/99-invalid fixture through the real evaluator", async () => {
    mocks.gate.mockResolvedValue({
      id: "gate",
      suiteName: "suite",
      environment: "test",
      minimumCaseCount: 100,
      rules: [rule],
    });
    mocks.aggregate.mockResolvedValue({
      candidate: run,
      baseline: run,
      metrics: [{ metricName: "correctness", candidate: metric, baseline: metric }],
    });
    const deps = {
      postgres: { db: {} },
      clickhouse: {},
      queues: {},
      logger: { warn: vi.fn() },
      config: { INGESTION_KEY_PEPPER: "test-pepper" },
    } as unknown as ApiDependencies;
    const app = createPublicQualityGatesRouter(deps);
    const response = await app.request("/gate/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from("public:secret").toString("base64")}`,
      },
      body: JSON.stringify({ candidateRunId: "candidate", baselineRunId: "baseline" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      verdict: "insufficient_data",
      gate: { rules: [{ evidence }] },
      rules: [{ verdict: "pass" }, { verdict: "insufficient_data", rule: { evidence } }],
    });
    expect(mocks.aggregate).toHaveBeenCalledOnce();
    expect(mocks.full).not.toHaveBeenCalled();
  });
});
