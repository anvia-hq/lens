import type { EvaluationResult, QualityGateCheckResponse, TraceDetail } from "@lens/contracts";
import {
  autoResolveAlertIncident,
  listEnabledAlertRules,
  openAlertIncident,
  type PostgresConnection,
} from "@lens/db";

export async function recordHumanReviewAlert(
  postgres: PostgresConnection,
  trace: TraceDetail,
  review: EvaluationResult,
): Promise<void> {
  const rules = (await listEnabledAlertRules(postgres.db, review.projectId)).filter(
    (rule) =>
      rule.kind === "failed_human_review" &&
      (!rule.environment || rule.environment === trace.summary.environment) &&
      (!rule.serviceName || rule.serviceName === trace.summary.serviceName),
  );
  for (const rule of rules) {
    if (review.outcome === "fail") {
      await openAlertIncident(postgres.db, rule, {
        subjectKey: trace.summary.traceId,
        summary: `Trace ${trace.summary.name} failed human review`,
        evidence: { traceIds: [trace.summary.traceId] },
      });
    } else {
      await autoResolveAlertIncident(postgres.db, rule.id, trace.summary.traceId, "review_passed");
    }
  }
}

export async function recordQualityGateAlert(
  postgres: PostgresConnection,
  projectId: string,
  result: QualityGateCheckResponse,
): Promise<void> {
  const rules = (await listEnabledAlertRules(postgres.db, projectId)).filter(
    (rule) => rule.kind === "failed_quality_gate" && rule.qualityGateId === result.gate.id,
  );
  const subjectKey = `${result.gate.id}:${result.candidateRunId}:${result.baselineRunId}`;
  for (const rule of rules) {
    if (result.verdict !== "pass") {
      await openAlertIncident(postgres.db, rule, {
        subjectKey,
        summary: `${result.gate.name} returned ${result.verdict.replace("_", " ")}`,
        evidence: {
          qualityGateId: result.gate.id,
          candidateRunId: result.candidateRunId,
          baselineRunId: result.baselineRunId,
        },
      });
    } else {
      await autoResolveAlertIncident(postgres.db, rule.id, subjectKey, "gate_passed");
    }
  }
}
