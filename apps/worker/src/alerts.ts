import type { AlertRuleKind, EvaluateAlertsJob } from "@lens/contracts";
import {
  autoResolveAlertIncident,
  listEnabledAlertRules,
  openAlertIncident,
  queryAlertMeasurement,
  updateAlertRuleState,
} from "@lens/db";
import type { Job } from "bullmq";
import type { ProcessorDependencies } from "./processors.js";

const thresholdKinds: AlertRuleKind[] = [
  "trace_error_rate",
  "trace_p95_latency_ms",
  "tool_error_rate",
];

export function createAlertProcessor(deps: ProcessorDependencies) {
  return async (job: Job<EvaluateAlertsJob>) => {
    const now = new Date();
    const rules = (await listEnabledAlertRules(deps.postgres.db, job.data.projectId)).filter(
      (rule) => thresholdKinds.includes(rule.kind),
    );
    // ponytail: one global scan is enough for self-hosted scale; shard by project if this nears 60s.
    for (const rule of rules) {
      if (!("minimumSamples" in rule)) continue;
      const measurement = await queryAlertMeasurement(deps.clickhouse, rule, now);
      if (measurement === undefined || measurement.sampleCount < rule.minimumSamples) {
        await updateAlertRuleState(deps.postgres.db, rule.id, {
          consecutiveBreaches: 0,
          lastEvaluatedAt: now,
        });
        continue;
      }
      if (measurement.value < rule.threshold) {
        const resolved = await autoResolveAlertIncident(
          deps.postgres.db,
          rule.id,
          "threshold",
          "healthy",
          now,
        );
        await updateAlertRuleState(deps.postgres.db, rule.id, {
          consecutiveBreaches: 0,
          lastEvaluatedAt: now,
          ...(resolved ? { cooldownUntil: new Date(now.getTime() + 30 * 60_000) } : {}),
        });
        continue;
      }
      const consecutiveBreaches = rule.consecutiveBreaches + 1;
      await updateAlertRuleState(deps.postgres.db, rule.id, {
        consecutiveBreaches,
        lastEvaluatedAt: now,
      });
      if (
        consecutiveBreaches >= 2 &&
        (rule.cooldownUntil === null || Date.parse(rule.cooldownUntil) <= now.getTime())
      ) {
        await openAlertIncident(
          deps.postgres.db,
          rule,
          {
            subjectKey: "threshold",
            summary: alertSummary(rule.kind, measurement.value, rule.threshold),
            observedValue: measurement.value,
            sampleCount: measurement.sampleCount,
            evidence: measurement.evidence,
          },
          now,
        );
      }
    }
  };
}

function alertSummary(kind: AlertRuleKind, value: number, threshold: number): string {
  if (kind === "trace_p95_latency_ms") {
    return `Trace P95 latency is ${Math.round(value)} ms (threshold ${Math.round(threshold)} ms)`;
  }
  const label = kind === "tool_error_rate" ? "Tool error rate" : "Trace error rate";
  return `${label} is ${(value * 100).toFixed(1)}% (threshold ${(threshold * 100).toFixed(1)}%)`;
}
