import { type DispatchAlertJob, dispatchAlertJobSchema } from "@lens/contracts";
import { loadDeliveryForDispatch, markDeliveryAttempt, markDeliveryFinished } from "@lens/db";
import { AlertDeliveryError, deliverAlert, renderAlertMessage } from "@lens/queue";
import type { Job } from "bullmq";
import type { ProcessorDependencies } from "./processors.js";

export function createAlertDispatchProcessor(deps: ProcessorDependencies) {
  return async (job: Job<DispatchAlertJob>) => {
    const { deliveryId } = dispatchAlertJobSchema.parse(job.data);
    const payload = await loadDeliveryForDispatch(deps.postgres.db, deliveryId);
    if (payload?.delivery.status !== "pending") return;
    const { delivery, channel, incident, projectName } = payload;
    if (!channel) {
      // Channel deleted before the first attempt; nothing to deliver to.
      await markDeliveryFinished(
        deps.postgres.db,
        deliveryId,
        "failed",
        delivery.attempts + 1,
        "channel deleted",
      );
      return;
    }
    const message = renderAlertMessage({
      ruleName: incident.ruleName,
      kind: incident.kind,
      summary: incident.summary,
      projectName,
      observedValue: incident.observedValue,
      threshold: incident.threshold,
      incidentUrl: new URL(`/${incident.projectId}/alerts/${incident.id}`, deps.appUrl).toString(),
    });
    try {
      await deliverAlert({ type: channel.type, config: channel.config }, message, {
        projectId: incident.projectId,
        incident,
      });
    } catch (error) {
      const attempts = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? 1;
      const retryable = !(error instanceof AlertDeliveryError) || error.retryable;
      const detail = error instanceof Error ? error.message : String(error);
      if (retryable && attempts < maxAttempts) {
        // Record progress on the row, then rethrow so BullMQ schedules the backoff retry.
        await markDeliveryAttempt(deps.postgres.db, deliveryId, attempts, detail);
        throw error;
      }
      // Final failure recorded on the row; job completes (matches the status-tracking
      // pattern used by the other processors).
      await markDeliveryFinished(deps.postgres.db, deliveryId, "failed", attempts, detail);
      return;
    }
    await markDeliveryFinished(
      deps.postgres.db,
      deliveryId,
      "delivered",
      job.attemptsMade + 1,
      null,
    );
  };
}
