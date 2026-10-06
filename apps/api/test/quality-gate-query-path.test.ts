import type { ClickHouseClient } from "@clickhouse/client";
import type { LensPostgres } from "@lens/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  full: vi.fn(),
  aggregate: vi.fn(),
  gate: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock("@lens/db", () => ({
  compareEvaluationRuns: mocks.full,
  compareEvaluationRunAggregates: mocks.aggregate,
  getQualityGate: mocks.gate,
}));
vi.mock("../src/modules/quality-gates/evaluate.js", () => ({
  evaluateQualityGate: mocks.evaluate,
}));
import { checkEvaluationRuns } from "../src/modules/quality-gates/check.js";

const run = { status: "completed", suiteName: "suite", environment: "test" };
const aggregate = { candidate: run, baseline: run, metrics: [] };
const clickhouse = {} as ClickHouseClient;
const postgres = {} as LensPostgres;
const input = { candidateRunId: "candidate", baselineRunId: "baseline" };

describe("quality gate query path", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.full.mockResolvedValue({ ...aggregate, caseChanges: [], caseChangeCounts: {} });
    mocks.aggregate.mockResolvedValue(aggregate);
    mocks.gate.mockResolvedValue({ suiteName: "suite", environment: "test" });
    mocks.evaluate.mockReturnValue({ verdict: "pass" });
  });

  it("uses aggregate-only reads for gate checks and passes them to the evaluator", async () => {
    const checked = await checkEvaluationRuns(clickhouse, postgres, "project", input, "gate", {
      includeCases: false,
    });
    expect(checked.ok).toBe(true);
    expect(mocks.aggregate).toHaveBeenCalledOnce();
    expect(mocks.full).not.toHaveBeenCalled();
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), aggregate);
  });

  it("keeps bounded case inspection on the comparison endpoint", async () => {
    const checked = await checkEvaluationRuns(clickhouse, postgres, "project", input);
    expect(checked.ok).toBe(true);
    expect(mocks.full).toHaveBeenCalledOnce();
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it("still rejects missing and incompatible aggregate-only runs", async () => {
    mocks.aggregate.mockResolvedValueOnce(undefined);
    expect(
      await checkEvaluationRuns(clickhouse, postgres, "project", input, "gate", {
        includeCases: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    mocks.aggregate.mockResolvedValueOnce({
      ...aggregate,
      candidate: { ...run, environment: "other" },
    });
    expect(
      await checkEvaluationRuns(clickhouse, postgres, "project", input, "gate", {
        includeCases: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "incompatible_runs" } });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});
