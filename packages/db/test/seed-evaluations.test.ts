import {
  evaluationResultSchema,
  evaluationRunSchema,
  qualityGateRuleSchema,
} from "@lens/contracts";
import { describe, expect, it } from "vitest";
import { buildSeedTelemetry } from "../src/seed-data.js";
import { buildSeedEvaluations, seedQualityGates } from "../src/seed-evaluations.js";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("seed evaluations", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const telemetry = buildSeedTelemetry(projectId, now);
  const seeded = buildSeedEvaluations(projectId, telemetry.traces, now);

  it("produces rows that satisfy the ingestion contracts", () => {
    for (const run of seeded.runs) evaluationRunSchema.parse(run);
    for (const result of seeded.results) evaluationResultSchema.parse(result);
    for (const gate of seedQualityGates) {
      for (const rule of gate.rules) qualityGateRuleSchema.parse(rule);
    }
  });

  it("is deterministic and links results to seeded runs and traces", () => {
    expect(buildSeedEvaluations(projectId, telemetry.traces, now)).toEqual(seeded);
    const runIds = new Set(seeded.runs.map((run) => run.id));
    const traceIds = new Set(telemetry.traceIds);
    expect(new Set(seeded.results.map((result) => result.id)).size).toBe(seeded.results.length);
    for (const result of seeded.results) {
      if (result.runId !== null) expect(runIds.has(result.runId)).toBe(true);
      if (result.traceId !== null) expect(traceIds.has(result.traceId)).toBe(true);
    }
    expect(new Set(seeded.runs.map((run) => run.status))).toEqual(
      new Set(["completed", "running", "failed"]),
    );
    expect(new Set(seeded.results.map((result) => result.source))).toEqual(
      new Set(["telemetry", "human", "end_user"]),
    );
  });
});
