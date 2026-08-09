import { alertRuleInputSchema, alertRuleKinds } from "@lens/contracts";
import {
  acknowledgeAlertIncident,
  activeAlertCount,
  alertRuleCount,
  alertRuleSnapshot,
  createAlertRule,
  deleteAlertRule,
  getAlertIncident,
  getAlertRule,
  getQualityGate,
  listAlertIncidents,
  listAlertRules,
  listTracesByIds,
  queryAlertSignalSeries,
  resolveAlertIncident,
  updateAlertRule,
} from "@lens/db";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createAlertsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/alert-rules", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listAlertRules(deps.postgres.db, access.project.id) });
    })
    .post("/:projectId/alert-rules", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const parsed = alertRuleInputSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_rule", "Invalid alert rule");
      if ((await alertRuleCount(deps.postgres.db, access.project.id)) >= 25) {
        return apiError(c, 409, "rule_limit", "A project can have up to 25 alert rules");
      }
      if (!(await gateExists(deps, access.project.id, parsed.data))) {
        return apiError(c, 400, "invalid_gate", "Quality gate not found");
      }
      try {
        const rule = await createAlertRule(
          deps.postgres.db,
          access.project.id,
          requiredSession(c).user.id,
          parsed.data,
        );
        queueEvaluation(deps, access.project.id);
        return c.json(rule, 201);
      } catch (error) {
        return duplicateOrThrow(c, error);
      }
    })
    .patch("/:projectId/alert-rules/:ruleId", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const parsed = alertRuleInputSchema.safeParse(await safeJson(c));
      if (!parsed.success) return apiError(c, 400, "invalid_rule", "Invalid alert rule");
      if (!(await gateExists(deps, access.project.id, parsed.data))) {
        return apiError(c, 400, "invalid_gate", "Quality gate not found");
      }
      try {
        const rule = await updateAlertRule(
          deps.postgres.db,
          access.project.id,
          c.req.param("ruleId"),
          parsed.data,
        );
        if (!rule) return apiError(c, 404, "not_found", "Alert rule not found");
        queueEvaluation(deps, access.project.id);
        return c.json(rule);
      } catch (error) {
        return duplicateOrThrow(c, error);
      }
    })
    .delete("/:projectId/alert-rules/:ruleId", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const deleted = await deleteAlertRule(
        deps.postgres.db,
        access.project.id,
        c.req.param("ruleId"),
      );
      return deleted ? c.body(null, 204) : apiError(c, 404, "not_found", "Alert rule not found");
    })
    .get("/:projectId/alerts/active-count", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ count: await activeAlertCount(deps.postgres.db, access.project.id) });
    })
    .get("/:projectId/alerts", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      const status = c.req.query("status");
      const kind = c.req.query("kind");
      const page = positiveInteger(c.req.query("page"), 1);
      const pageSize = positiveInteger(c.req.query("pageSize"), 50);
      if (status && status !== "active" && status !== "resolved") {
        return apiError(c, 400, "invalid_query", "Invalid alert status");
      }
      if (kind && !alertRuleKinds.includes(kind as (typeof alertRuleKinds)[number])) {
        return apiError(c, 400, "invalid_query", "Invalid alert kind");
      }
      return c.json(
        await listAlertIncidents(deps.postgres.db, access.project.id, {
          status: status as "active" | "resolved" | undefined,
          kind: kind as (typeof alertRuleKinds)[number] | undefined,
          page,
          pageSize,
        }),
      );
    })
    .get("/:projectId/alerts/:incidentId", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      const stored = await getAlertIncident(
        deps.postgres.db,
        access.project.id,
        c.req.param("incidentId"),
      );
      if (!stored) return apiError(c, 404, "not_found", "Alert incident not found");
      const currentRule =
        !stored.rule && stored.incident.ruleId
          ? await getAlertRule(deps.postgres.db, access.project.id, stored.incident.ruleId)
          : undefined;
      const rule = stored.rule ?? (currentRule ? alertRuleSnapshot(currentRule) : null);
      const traces = await listTracesByIds(
        deps.clickhouse,
        access.project.id,
        stored.incident.evidence.traceIds ?? [],
      );
      const tracesById = new Map(traces.map((trace) => [trace.traceId, trace]));
      return c.json({
        incident: stored.incident,
        rule,
        signal: rule
          ? await queryAlertSignalSeries(deps.clickhouse, access.project.id, rule, stored.incident)
          : null,
        evidenceTraces: (stored.incident.evidence.traceIds ?? []).map((traceId) => ({
          traceId,
          trace: tracesById.get(traceId) ?? null,
        })),
      });
    })
    .post("/:projectId/alerts/:incidentId/acknowledge", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      const incident = await acknowledgeAlertIncident(
        deps.postgres.db,
        access.project.id,
        c.req.param("incidentId"),
        requiredSession(c).user.id,
      );
      return incident
        ? c.json(incident)
        : apiError(c, 409, "not_open", "Only open alerts can be acknowledged");
    })
    .post("/:projectId/alerts/:incidentId/resolve", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      const incident = await resolveAlertIncident(
        deps.postgres.db,
        access.project.id,
        c.req.param("incidentId"),
        requiredSession(c).user.id,
      );
      return incident
        ? c.json(incident)
        : apiError(c, 409, "not_active", "Only active alerts can be resolved");
    });

async function accessFor(c: Parameters<typeof requiredSession>[0], deps: ApiDependencies) {
  return requireProjectAccess(
    deps.postgres.db,
    c.req.param("projectId") ?? "",
    requiredSession(c).user.id,
  );
}

async function gateExists(
  deps: ApiDependencies,
  projectId: string,
  input: { kind: string; qualityGateId?: string },
) {
  if (input.kind !== "failed_quality_gate") return true;
  return Boolean(
    input.qualityGateId && (await getQualityGate(deps.postgres.db, projectId, input.qualityGateId)),
  );
}

function queueEvaluation(deps: ApiDependencies, projectId: string) {
  void deps.queues.alerts
    .add("evaluate-alert-rules", { projectId })
    .catch((error: unknown) =>
      deps.logger.warn({ err: error, projectId }, "failed to queue alert evaluation"),
    );
}

function adminRequired(c: Parameters<typeof requiredSession>[0]) {
  return apiError(c, 403, "forbidden", "Admin access is required");
}

function duplicateOrThrow(c: Parameters<typeof requiredSession>[0], error: unknown) {
  if ((error as { code?: unknown }).code === "23505") {
    return apiError(c, 409, "duplicate_rule", "An alert rule with this name already exists");
  }
  throw error;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
