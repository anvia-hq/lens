import { getEvaluationDatasetDetail, listEvaluationDatasets } from "@lens/db";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createEvaluationDatasetsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/evaluation-datasets/detail", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const name = c.req.query("name")?.trim();
      if (!name) return apiError(c, 400, "invalid_query", "Dataset name is required");
      const versionQuery = c.req.query("version");
      const version =
        c.req.query("unversioned") === "1"
          ? null
          : versionQuery === undefined
            ? undefined
            : versionQuery.trim();
      const detail = await getEvaluationDatasetDetail(deps.clickhouse, projectId, name, version);
      return detail === undefined
        ? apiError(c, 404, "not_found", "Evaluation dataset was not found")
        : c.json(detail);
    })
    .get("/:projectId/evaluation-datasets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const page = positiveInteger(c.req.query("page"), 1);
      const pageSize = pageSizeValue(c.req.query("pageSize"));
      const search = c.req.query("search")?.trim() || undefined;
      return c.json(
        await listEvaluationDatasets(deps.clickhouse, projectId, { page, pageSize, search }),
      );
    });

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pageSizeValue(value: string | undefined): 25 | 50 | 100 {
  const parsed = Number(value);
  return parsed === 50 || parsed === 100 ? parsed : 25;
}
