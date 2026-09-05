import { alertChannelInputSchema, alertRuleInputSchema, alertRuleKinds } from "@lens/contracts";
import {
  acknowledgeAlertIncident,
  activeAlertCount,
  alertChannelCount,
  alertRuleCount,
  createAlertChannel,
  createAlertRule,
  deleteAlertChannel,
  deleteAlertRule,
  getAlertChannelWithConfig,
  getQualityGate,
  listAlertChannels,
  listAlertIncidents,
  listAlertRules,
  resolveAlertIncident,
  updateAlertChannel,
  updateAlertRule,
} from "@lens/db";
import { deliverAlert, renderAlertMessage } from "@lens/queue";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { loadAlertIncidentDetail } from "./services.js";

export const createAlertsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/alert-rules", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listAlertRules(deps.postgres.db, access.project.id) });
    })
    .post(
      "/:projectId/alert-rules",
      jsonInput(alertRuleInputSchema, "invalid_rule", "Invalid alert rule"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (!access) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        if ((await alertRuleCount(deps.postgres.db, access.project.id)) >= 25) {
          return apiError(c, 409, "rule_limit", "A project can have up to 25 alert rules");
        }
        if (!(await gateExists(deps, access.project.id, parsed))) {
          return apiError(c, 400, "invalid_gate", "Quality gate not found");
        }
        try {
          const rule = await createAlertRule(
            deps.postgres.db,
            access.project.id,
            requiredSession(c).user.id,
            parsed,
          );
          queueEvaluation(deps, access.project.id);
          return c.json(rule, 201);
        } catch (error) {
          return duplicateOrThrow(c, error, "An alert rule with this name already exists");
        }
      },
    )
    .patch(
      "/:projectId/alert-rules/:ruleId",
      jsonInput(alertRuleInputSchema, "invalid_rule", "Invalid alert rule"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (!access) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        if (!(await gateExists(deps, access.project.id, parsed))) {
          return apiError(c, 400, "invalid_gate", "Quality gate not found");
        }
        try {
          const rule = await updateAlertRule(
            deps.postgres.db,
            access.project.id,
            c.req.param("ruleId"),
            parsed,
          );
          if (!rule) return apiError(c, 404, "not_found", "Alert rule not found");
          queueEvaluation(deps, access.project.id);
          return c.json(rule);
        } catch (error) {
          return duplicateOrThrow(c, error, "An alert rule with this name already exists");
        }
      },
    )
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
    .get("/:projectId/alert-channels", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      return c.json({ items: await listAlertChannels(deps.postgres.db, access.project.id) });
    })
    .post(
      "/:projectId/alert-channels",
      jsonInput(alertChannelInputSchema, "invalid_channel", "Invalid alert channel"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (!access) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        if ((await alertChannelCount(deps.postgres.db, access.project.id)) >= 25) {
          return apiError(c, 409, "channel_limit", "A project can have up to 25 alert channels");
        }
        try {
          const channel = await createAlertChannel(
            deps.postgres.db,
            access.project.id,
            requiredSession(c).user.id,
            parsed,
          );
          return c.json(channel, 201);
        } catch (error) {
          return duplicateOrThrow(c, error, "An alert channel with this name already exists");
        }
      },
    )
    .patch(
      "/:projectId/alert-channels/:channelId",
      jsonInput(alertChannelInputSchema, "invalid_channel", "Invalid alert channel"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (!access) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const parsed = c.req.valid("json");
        try {
          const channel = await updateAlertChannel(
            deps.postgres.db,
            access.project.id,
            c.req.param("channelId"),
            parsed,
          );
          if (!channel) return apiError(c, 404, "not_found", "Alert channel not found");
          return c.json(channel);
        } catch (error) {
          return duplicateOrThrow(c, error, "An alert channel with this name already exists");
        }
      },
    )
    .delete("/:projectId/alert-channels/:channelId", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const deleted = await deleteAlertChannel(
        deps.postgres.db,
        access.project.id,
        c.req.param("channelId"),
      );
      return deleted ? c.body(null, 204) : apiError(c, 404, "not_found", "Alert channel not found");
    })
    .post("/:projectId/alert-channels/:channelId/test", async (c) => {
      const access = await accessFor(c, deps);
      if (!access) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const channel = await getAlertChannelWithConfig(
        deps.postgres.db,
        access.project.id,
        c.req.param("channelId"),
      );
      if (!channel) return apiError(c, 404, "not_found", "Alert channel not found");
      const message = renderAlertMessage({
        ruleName: "Test alert",
        kind: "trace_error_rate",
        summary: "This is a test alert from Anvia Lens",
        projectName: access.project.name,
        observedValue: null,
        threshold: null,
        incidentUrl: new URL(`/${access.project.id}/alerts`, deps.config.PUBLIC_APP_URL).toString(),
      });
      try {
        await deliverAlert({ type: channel.type, config: channel.config }, message, undefined);
        return c.json({ ok: true });
      } catch (error) {
        return apiError(
          c,
          502,
          "delivery_failed",
          error instanceof Error ? error.message : "Delivery failed",
        );
      }
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
      const detail = await loadAlertIncidentDetail(
        deps,
        access.project.id,
        c.req.param("incidentId"),
      );
      return detail === undefined
        ? apiError(c, 404, "not_found", "Alert incident not found")
        : c.json(detail);
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

function duplicateOrThrow(
  c: Parameters<typeof requiredSession>[0],
  error: unknown,
  message: string,
) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return apiError(c, 409, "duplicate_rule", message);
  }
  throw error;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
