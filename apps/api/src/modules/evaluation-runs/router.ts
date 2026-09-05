import {
  getEvaluationRunDetail,
  getPublishedManagedDataset,
  listEvaluationRunFacets,
  listEvaluationRuns,
} from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, queryInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { recordQualityGateAlert } from "../alerts/events.js";
import { checkEvaluationRuns } from "../quality-gates/check.js";
import { runQuerySchema } from "./schema.js";

export const createEvaluationRunsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/evaluation-runs/compare", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const candidateRunId = c.req.query("candidateRunId")?.trim();
      const baselineRunId = c.req.query("baselineRunId")?.trim();
      if (!candidateRunId || !baselineRunId || candidateRunId === baselineRunId) {
        return apiError(c, 400, "invalid_comparison", "Two different run IDs are required");
      }
      const checked = await checkEvaluationRuns(
        deps.clickhouse,
        deps.postgres.db,
        projectId,
        { candidateRunId, baselineRunId },
        c.req.query("gateId")?.trim() || undefined,
      );
      if (!checked.ok) {
        return apiError(c, checked.error.status, checked.error.code, checked.error.message);
      }
      if (checked.comparison.gate !== null) {
        await recordQualityGateAlert(deps.postgres, deps.queues, deps.logger, projectId, {
          ...checked.comparison.gate,
          candidateRunId,
          baselineRunId,
        }).catch((error: unknown) =>
          deps.logger.warn({ err: error, projectId }, "failed to record gate alert"),
        );
      }
      return c.json(checked.comparison);
    })
    .get("/:projectId/evaluation-runs", queryInput(runQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listEvaluationRuns(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/evaluation-runs/facets", queryInput(runQuerySchema), async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = c.req.valid("query");
      return c.json(await listEvaluationRunFacets(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/evaluation-runs/:runId", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const detail = await getEvaluationRunDetail(deps.clickhouse, projectId, c.req.param("runId"));
      if (detail === undefined) return apiError(c, 404, "not_found", "Evaluation run not found");
      if (detail.run.datasetName === null || detail.run.datasetVersion === null) {
        return c.json(detail);
      }
      const dataset = await getPublishedManagedDataset(
        deps.postgres.db,
        projectId,
        detail.run.datasetName,
        detail.run.datasetVersion,
      );
      if (dataset === undefined) return c.json(detail);
      const items = new Map(dataset.items.map((item) => [item.id, item]));
      return c.json({
        ...detail,
        cases: detail.cases.map((item) => ({
          ...item,
          datasetItem: item.caseId === null ? null : (items.get(item.caseId) ?? null),
        })),
      });
    });
