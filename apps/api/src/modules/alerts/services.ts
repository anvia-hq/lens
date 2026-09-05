import type { AlertIncident, AlertRuleInput } from "@lens/contracts";
import {
  alertRuleSnapshot,
  getAlertIncident,
  getAlertRule,
  listIncidentDeliveries,
  listTracesByIds,
  queryAlertContributorAnalysis,
  queryAlertSignalSeries,
  resolveAlertContributorRange,
} from "@lens/db";
import type { ApiDependencies } from "../../utils/types.js";

export async function loadAlertIncidentDetail(
  deps: ApiDependencies,
  projectId: string,
  incidentId: string,
) {
  const stored = await getAlertIncident(deps.postgres.db, projectId, incidentId);
  if (!stored) return undefined;
  const currentRule =
    !stored.rule && stored.incident.ruleId
      ? await getAlertRule(deps.postgres.db, projectId, stored.incident.ruleId)
      : undefined;
  const rule = stored.rule ?? (currentRule ? alertRuleSnapshot(currentRule) : null);
  const [traces, signal, contributorAnalysis, deliveries] = await Promise.all([
    listTracesByIds(deps.clickhouse, projectId, stored.incident.evidence.traceIds ?? []),
    rule ? queryAlertSignalSeries(deps.clickhouse, projectId, rule, stored.incident) : null,
    rule ? incidentContributorAnalysis(deps, projectId, rule, stored.incident) : null,
    listIncidentDeliveries(deps.postgres.db, projectId, incidentId),
  ]);
  const tracesById = new Map(traces.map((trace) => [trace.traceId, trace]));
  return {
    incident: stored.incident,
    rule,
    signal,
    contributorAnalysis,
    evidenceTraces: (stored.incident.evidence.traceIds ?? []).map((traceId) => ({
      traceId,
      trace: tracesById.get(traceId) ?? null,
    })),
    deliveries,
  };
}

async function incidentContributorAnalysis(
  deps: ApiDependencies,
  projectId: string,
  rule: AlertRuleInput,
  incident: AlertIncident,
) {
  if (!("windowMinutes" in rule)) return null;
  try {
    return await queryAlertContributorAnalysis(deps.clickhouse, projectId, rule, incident);
  } catch (error) {
    deps.logger.warn(
      { err: error, projectId, incidentId: incident.id },
      "failed to analyze alert contributors",
    );
    return {
      ...resolveAlertContributorRange(rule.windowMinutes, incident),
      hints: [],
      unavailableReason: "analysis_failed" as const,
    };
  }
}
