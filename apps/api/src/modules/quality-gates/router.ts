import { qualityGateInputSchema } from "@lens/contracts";
import {
  createQualityGate,
  deleteAlertRule,
  deleteQualityGate,
  getQualityGate,
  listAlertRules,
  listQualityGates,
  updateQualityGate,
} from "@lens/db";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createQualityGatesRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/quality-gates", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listQualityGates(deps.postgres.db, access.project.id) });
    })
    .post(
      "/:projectId/quality-gates",
      jsonInput(qualityGateInputSchema, "invalid_gate", "Invalid quality gate"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role))
          return apiError(c, 403, "forbidden", "Admin access is required");
        const parsed = c.req.valid("json");
        try {
          return c.json(await createQualityGate(deps.postgres.db, access.project.id, parsed), 201);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return apiError(c, 409, "duplicate_gate", "A gate with this name already exists");
          }
          throw error;
        }
      },
    )
    .patch(
      "/:projectId/quality-gates/:gateId",
      jsonInput(qualityGateInputSchema, "invalid_gate", "Invalid quality gate"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role))
          return apiError(c, 403, "forbidden", "Admin access is required");
        const parsed = c.req.valid("json");
        const gate = await getQualityGate(
          deps.postgres.db,
          access.project.id,
          c.req.param("gateId"),
        );
        if (gate === undefined) return apiError(c, 404, "not_found", "Quality gate not found");
        try {
          return c.json(
            await updateQualityGate(
              deps.postgres.db,
              access.project.id,
              c.req.param("gateId"),
              parsed,
            ),
          );
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return apiError(c, 409, "duplicate_gate", "A gate with this name already exists");
          }
          throw error;
        }
      },
    )
    .delete("/:projectId/quality-gates/:gateId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
      const dependentRules = (await listAlertRules(deps.postgres.db, access.project.id)).filter(
        (rule) =>
          rule.kind === "failed_quality_gate" && rule.qualityGateId === c.req.param("gateId"),
      );
      for (const rule of dependentRules) {
        await deleteAlertRule(deps.postgres.db, access.project.id, rule.id);
      }
      const deleted = await deleteQualityGate(
        deps.postgres.db,
        access.project.id,
        c.req.param("gateId"),
      );
      return deleted ? c.body(null, 204) : apiError(c, 404, "not_found", "Quality gate not found");
    });

async function accessFor(c: Parameters<typeof requiredSession>[0], deps: ApiDependencies) {
  return requireProjectAccess(
    deps.postgres.db,
    c.req.param("projectId") ?? "",
    requiredSession(c).user.id,
  );
}
