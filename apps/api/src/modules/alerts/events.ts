import type { EvaluationResult, QualityGateCheckResponse, TraceSummary } from "@lens/contracts";
import type { LensPostgres, PostgresConnection } from "@lens/db";
import {
  autoResolveAlertIncident,
  createPendingDeliveries,
  listAlertChannelsByIds,
  listEnabledAlertRules,
  openAlertIncident,
} from "@lens/db";
import type { LensQueues } from "@lens/queue";
import type { Logger } from "pino";

// Enqueue one delivery per configured channel when an incident is first opened.
async function scheduleDispatch(
  db: LensPostgres,
  queues: LensQueues,
  logger: Logger,
  projectId: string,
  incidentId: string,
  channelIds: string[],
): Promise<void> {
  if (channelIds.length === 0) return;
  const channels = await listAlertChannelsByIds(db, projectId, channelIds);
  if (channels.length === 0) return;
  const deliveries = await createPendingDeliveries(db, projectId, incidentId, channels);
  await Promise.all(
    deliveries.map((delivery) =>
      queues.dispatch
        .add(
          "dispatch-alert",
          { deliveryId: delivery.id },
          { jobId: `alert-delivery-${delivery.id}` }, // BullMQ dedupes on jobId
        )
        .catch((error: unknown) =>
          logger.warn({ err: error, deliveryId: delivery.id }, "failed to queue alert delivery"),
        ),
    ),
  );
}

export async function recordHumanReviewAlert(
  postgres: PostgresConnection,
  queues: LensQueues,
  logger: Logger,
  trace: TraceSummary,
  review: EvaluationResult,
): Promise<void> {
  const rules = (await listEnabledAlertRules(postgres.db, review.projectId)).filter(
    (rule) =>
      rule.kind === "failed_human_review" &&
      (!rule.environment || rule.environment === trace.environment) &&
      (!rule.serviceName || rule.serviceName === trace.serviceName),
  );
  for (const rule of rules) {
    if (review.outcome === "fail") {
      const opened = await openAlertIncident(postgres.db, rule, {
        subjectKey: trace.traceId,
        summary: `Trace ${trace.name} failed human review`,
        evidence: { traceIds: [trace.traceId] },
      });
      if (opened.created && opened.incidentId) {
        await scheduleDispatch(
          postgres.db,
          queues,
          logger,
          rule.projectId,
          opened.incidentId,
          rule.channelIds,
        );
      }
    } else {
      await autoResolveAlertIncident(postgres.db, rule.id, trace.traceId, "review_passed");
    }
  }
}

export async function recordQualityGateAlert(
  postgres: PostgresConnection,
  queues: LensQueues,
  logger: Logger,
  projectId: string,
  result: QualityGateCheckResponse,
): Promise<void> {
  const rules = (await listEnabledAlertRules(postgres.db, projectId)).filter(
    (rule) => rule.kind === "failed_quality_gate" && rule.qualityGateId === result.gate.id,
  );
  const subjectKey = `${result.gate.id}:${result.candidateRunId}:${result.baselineRunId}`;
  for (const rule of rules) {
    if (result.verdict !== "pass") {
      const opened = await openAlertIncident(postgres.db, rule, {
        subjectKey,
        summary: `${result.gate.name} returned ${result.verdict.replace("_", " ")}`,
        evidence: {
          qualityGateId: result.gate.id,
          candidateRunId: result.candidateRunId,
          baselineRunId: result.baselineRunId,
        },
      });
      if (opened.created && opened.incidentId) {
        await scheduleDispatch(
          postgres.db,
          queues,
          logger,
          rule.projectId,
          opened.incidentId,
          rule.channelIds,
        );
      }
    } else {
      await autoResolveAlertIncident(postgres.db, rule.id, subjectKey, "gate_passed");
    }
  }
}
