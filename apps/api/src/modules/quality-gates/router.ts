import { qualityGateInputSchema } from "@lens/contracts";
import {
  createQualityGate,
  deleteQualityGate,
  getQualityGate,
  listQualityGates,
  updateQualityGate,
} from "@lens/db";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createQualityGatesRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/quality-gates", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listQualityGates(deps.postgres.db, access.project.id) });
    })
    .post("/:projectId/quality-gates", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
      const parsed = qualityGateInputSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_gate", "Invalid quality gate");
      try {
        return c.json(
          await createQualityGate(deps.postgres.db, access.project.id, parsed.data),
          201,
        );
      } catch (error) {
        if ((error as { code?: unknown }).code === "23505") {
          return apiError(c, 409, "duplicate_gate", "A gate with this name already exists");
        }
        throw error;
      }
    })
    .patch("/:projectId/quality-gates/:gateId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
      const parsed = qualityGateInputSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_gate", "Invalid quality gate");
      const gate = await getQualityGate(deps.postgres.db, access.project.id, c.req.param("gateId"));
      if (gate === undefined) return apiError(c, 404, "not_found", "Quality gate not found");
      try {
        return c.json(
          await updateQualityGate(
            deps.postgres.db,
            access.project.id,
            c.req.param("gateId"),
            parsed.data,
          ),
        );
      } catch (error) {
        if ((error as { code?: unknown }).code === "23505") {
          return apiError(c, 409, "duplicate_gate", "A gate with this name already exists");
        }
        throw error;
      }
    })
    .delete("/:projectId/quality-gates/:gateId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
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
