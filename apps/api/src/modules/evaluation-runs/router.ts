import {
  compareEvaluationRuns,
  getEvaluationRunDetail,
  getPublishedManagedDataset,
  getQualityGate,
  listEvaluationRunFacets,
  listEvaluationRuns,
} from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { evaluateQualityGate } from "../quality-gates/evaluate.js";
import { parseRunRequest } from "./schema.js";

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
      const comparison = await compareEvaluationRuns(
        deps.clickhouse,
        projectId,
        candidateRunId,
        baselineRunId,
      );
      if (comparison === undefined) {
        return apiError(c, 404, "not_found", "Candidate or baseline run was not found");
      }
      if (
        comparison.candidate.status !== "completed" ||
        comparison.baseline.status !== "completed"
      ) {
        return apiError(c, 400, "incomplete_runs", "Only completed runs can be compared");
      }
      if (
        comparison.candidate.suiteName !== comparison.baseline.suiteName ||
        comparison.candidate.environment !== comparison.baseline.environment
      ) {
        return apiError(
          c,
          400,
          "incompatible_runs",
          "Runs must use the same suite and environment",
        );
      }
      const gateId = c.req.query("gateId")?.trim();
      if (!gateId) return c.json({ ...comparison, gate: null });
      const gate = await getQualityGate(deps.postgres.db, projectId, gateId);
      if (gate === undefined) return apiError(c, 404, "gate_not_found", "Quality gate not found");
      if (
        gate.suiteName !== comparison.candidate.suiteName ||
        gate.environment !== comparison.candidate.environment
      ) {
        return apiError(
          c,
          400,
          "incompatible_gate",
          "Gate does not match the run suite and environment",
        );
      }
      return c.json({ ...comparison, gate: evaluateQualityGate(gate, comparison) });
    })
    .get("/:projectId/evaluation-runs", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseRunRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listEvaluationRuns(deps.clickhouse, projectId, parsed));
    })
    .get("/:projectId/evaluation-runs/facets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseRunRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
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
