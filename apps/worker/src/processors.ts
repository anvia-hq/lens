import {
  deleteProjectTelemetryJobSchema,
  type IngestEvaluationsJob,
  type IngestTraceJob,
  type MaterializeTraceJob,
  recalculateModelCostsJobSchema,
  reconcileRetentionJobSchema,
} from "@lens/contracts";
import {
  applyModelPrices,
  type ClickHouseClient,
  costRecalculation,
  deleteProjectTelemetry,
  insertEvaluationRuns,
  insertEvaluations,
  insertSpans,
  llmModelPrice,
  materializeTrace,
  type PostgresConnection,
  project,
  recalculateModelCosts,
  reconcileProjectRetention,
} from "@lens/db";
import { type LensQueues, materializeJobId } from "@lens/queue";
import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";

export type ProcessorDependencies = {
  clickhouse: ClickHouseClient;
  postgres: PostgresConnection;
  queues: LensQueues;
  logger: Logger;
};

export function createIngestTraceProcessor(deps: ProcessorDependencies) {
  return async (job: Job<IngestTraceJob>) => {
    const modelNames = Array.from(
      new Set(
        job.data.spans.flatMap((span) =>
          span.model === null ||
          (span.observationKind !== "generation" && span.observationKind !== "embedding")
            ? []
            : [span.model],
        ),
      ),
    );
    const [projectRow] = await deps.postgres.db
      .select({ organizationId: project.organizationId })
      .from(project)
      .where(eq(project.id, job.data.projectId))
      .limit(1);
    const priceRows =
      projectRow === undefined || modelNames.length === 0
        ? []
        : await deps.postgres.db
            .select()
            .from(llmModelPrice)
            .where(
              and(
                eq(llmModelPrice.organizationId, projectRow.organizationId),
                inArray(llmModelPrice.model, modelNames),
              ),
            );
    const spans = applyModelPrices(
      job.data.spans,
      priceRows.map((row) => ({
        model: row.model,
        inputPricePerMillion: Number(row.inputPricePerMillion),
        cachedInputPricePerMillion:
          row.cachedInputPricePerMillion === null ? null : Number(row.cachedInputPricePerMillion),
        outputPricePerMillion: Number(row.outputPricePerMillion),
      })),
    );
    await insertSpans(deps.clickhouse, spans);
    for (const traceId of new Set(job.data.spans.map((span) => span.traceId))) {
      await deps.queues.materialize.add(
        "materialize",
        { projectId: job.data.projectId, traceId },
        {
          delay: 1_500,
          jobId: materializeJobId(job.data.projectId, traceId),
          removeOnComplete: true,
        },
      );
    }
    deps.logger.info({ jobId: job.id, spans: job.data.spans.length }, "ingested trace batch");
  };
}

export function createMaterializeTraceProcessor(deps: ProcessorDependencies) {
  return async (job: Job<MaterializeTraceJob>) => {
    await materializeTrace(deps.clickhouse, job.data.projectId, job.data.traceId);
  };
}

export function createEvaluationProcessor(deps: ProcessorDependencies) {
  return async (job: Job<IngestEvaluationsJob>) => {
    const runs = job.data.runs ?? [];
    await Promise.all([
      insertEvaluations(deps.clickhouse, job.data.evaluations),
      insertEvaluationRuns(deps.clickhouse, runs),
    ]);
    deps.logger.info(
      { jobId: job.id, evaluations: job.data.evaluations.length, runs: runs.length },
      "ingested evaluation batch",
    );
  };
}

export function createMaintenanceProcessor(deps: ProcessorDependencies) {
  return async (job: Job<unknown>) => {
    if (job.name === "reconcile-retention") {
      const data = reconcileRetentionJobSchema.parse(job.data);
      const [row] = await deps.postgres.db
        .select({ retentionDays: project.retentionDays })
        .from(project)
        .where(eq(project.id, data.projectId))
        .limit(1);
      if (row === undefined) return;
      const retentionDays = row.retentionDays === "unlimited" ? null : Number(row.retentionDays);
      await reconcileProjectRetention(deps.clickhouse, data.projectId, retentionDays);
      return;
    }
    if (job.name === "delete-project") {
      const data = deleteProjectTelemetryJobSchema.parse(job.data);
      await deleteProjectTelemetry(deps.clickhouse, data.projectId);
      await deps.postgres.db.delete(project).where(eq(project.id, data.projectId));
      return;
    }
    throw new Error(`Unsupported maintenance job: ${job.name}`);
  };
}

export function createCostsProcessor(deps: ProcessorDependencies) {
  return async (job: Job<unknown>) => {
    if (job.name !== "recalculate-model-costs") {
      throw new Error(`Unsupported cost job: ${job.name}`);
    }
    const data = recalculateModelCostsJobSchema.parse(job.data);
    const [run] = await deps.postgres.db
      .select()
      .from(costRecalculation)
      .where(eq(costRecalculation.id, data.recalculationId))
      .limit(1);
    if (run === undefined || run.status === "completed") return;
    await deps.postgres.db
      .update(costRecalculation)
      .set({ status: "running", startedAt: new Date(), completedAt: null, error: null })
      .where(eq(costRecalculation.id, run.id));
    try {
      const projectRows = await deps.postgres.db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.organizationId, run.organizationId));
      const result = await recalculateModelCosts(deps.clickhouse, {
        projectIds: projectRows.map((row) => row.id),
        prices: run.priceSnapshot,
        from: run.from?.toISOString() ?? null,
        to: run.to?.toISOString() ?? null,
      });
      await deps.postgres.db
        .update(costRecalculation)
        .set({
          status: "completed",
          affectedSpans: String(result.affectedSpans),
          affectedTraces: String(result.affectedTraces),
          completedAt: new Date(),
          error: null,
        })
        .where(eq(costRecalculation.id, run.id));
      deps.logger.info({ jobId: job.id, ...result }, "recalculated model costs");
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await deps.postgres.db
        .update(costRecalculation)
        .set({
          status: finalAttempt ? "failed" : "queued",
          completedAt: finalAttempt ? new Date() : null,
          error: error instanceof Error ? error.message.slice(0, 2_000) : "Unknown worker error",
        })
        .where(eq(costRecalculation.id, run.id));
      throw error;
    }
  };
}
