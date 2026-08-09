import type { ClickHouseClient } from "@clickhouse/client";
import type { QualityGateCheckInput } from "@lens/contracts";
import { compareEvaluationRuns, getQualityGate, type LensPostgres } from "@lens/db";
import { evaluateQualityGate } from "./evaluate.js";

type CheckError = {
  status: 400 | 404;
  code: string;
  message: string;
};

export async function checkEvaluationRuns(
  clickhouse: ClickHouseClient,
  postgres: LensPostgres,
  projectId: string,
  input: QualityGateCheckInput,
  gateId?: string,
) {
  const comparison = await compareEvaluationRuns(
    clickhouse,
    projectId,
    input.candidateRunId,
    input.baselineRunId,
  );
  if (comparison === undefined)
    return failure(404, "not_found", "Candidate or baseline run was not found");
  if (comparison.candidate.status !== "completed" || comparison.baseline.status !== "completed") {
    return failure(400, "incomplete_runs", "Only completed runs can be compared");
  }
  if (
    comparison.candidate.suiteName !== comparison.baseline.suiteName ||
    comparison.candidate.environment !== comparison.baseline.environment
  ) {
    return failure(400, "incompatible_runs", "Runs must use the same suite and environment");
  }
  if (gateId === undefined) return { ok: true as const, comparison: { ...comparison, gate: null } };

  const gate = await getQualityGate(postgres, projectId, gateId);
  if (gate === undefined) return failure(404, "gate_not_found", "Quality gate not found");
  if (
    gate.suiteName !== comparison.candidate.suiteName ||
    gate.environment !== comparison.candidate.environment
  ) {
    return failure(400, "incompatible_gate", "Gate does not match the run suite and environment");
  }
  return {
    ok: true as const,
    comparison: { ...comparison, gate: evaluateQualityGate(gate, comparison) },
  };
}

function failure(status: CheckError["status"], code: string, message: string) {
  return { ok: false as const, error: { status, code, message } satisfies CheckError };
}
