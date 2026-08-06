import type { ClickHouseClient } from "@clickhouse/client";
import type {
  CostRecalculation,
  CostRecalculationsResponse,
  LlmModel,
  LlmModelsResponse,
} from "@lens/contracts";
import {
  costRecalculation,
  type LensPostgres,
  listObservedModels,
  llmModelPrice,
  project,
  user,
} from "@lens/db";
import { desc, eq } from "drizzle-orm";

export async function listOrganizationModels(
  db: LensPostgres,
  clickhouse: ClickHouseClient,
  organizationId: string,
): Promise<LlmModelsResponse> {
  const [prices, projectRows] = await Promise.all([
    db.select().from(llmModelPrice).where(eq(llmModelPrice.organizationId, organizationId)),
    db.select({ id: project.id }).from(project).where(eq(project.organizationId, organizationId)),
  ]);
  const observed = new Set(
    await listObservedModels(
      clickhouse,
      projectRows.map((row) => row.id),
    ),
  );
  const configured = new Map(prices.map((row) => [row.model, row]));
  const names = Array.from(new Set([...observed, ...configured.keys()])).sort((left, right) =>
    left.localeCompare(right),
  );
  const items: LlmModel[] = names.map((model) => {
    const row = configured.get(model);
    return {
      id: row?.id ?? null,
      model,
      observed: observed.has(model),
      inputPricePerMillion: row === undefined ? null : Number(row.inputPricePerMillion),
      cachedInputPricePerMillion:
        row?.cachedInputPricePerMillion === null || row === undefined
          ? null
          : Number(row.cachedInputPricePerMillion),
      outputPricePerMillion: row === undefined ? null : Number(row.outputPricePerMillion),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
  return { items };
}

export async function listOrganizationRecalculations(
  db: LensPostgres,
  organizationId: string,
): Promise<CostRecalculationsResponse> {
  const rows = await db
    .select({ recalculation: costRecalculation, requester: user })
    .from(costRecalculation)
    .innerJoin(user, eq(costRecalculation.requestedBy, user.id))
    .where(eq(costRecalculation.organizationId, organizationId))
    .orderBy(desc(costRecalculation.createdAt))
    .limit(10);
  const recalculations = rows.map(
    ({ recalculation, requester }): CostRecalculation => ({
      id: recalculation.id,
      status: recalculation.status,
      from: recalculation.from?.toISOString() ?? null,
      to: recalculation.to?.toISOString() ?? null,
      requestedBy: { id: requester.id, name: requester.name, email: requester.email },
      affectedSpans:
        recalculation.affectedSpans === null ? null : Number(recalculation.affectedSpans),
      affectedTraces:
        recalculation.affectedTraces === null ? null : Number(recalculation.affectedTraces),
      error: recalculation.error,
      createdAt: recalculation.createdAt.toISOString(),
      startedAt: recalculation.startedAt?.toISOString() ?? null,
      completedAt: recalculation.completedAt?.toISOString() ?? null,
    }),
  );
  return {
    recalculations,
    hasActiveRecalculation: recalculations.some(
      (run) => run.status === "queued" || run.status === "running",
    ),
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
