import type { EvaluationResult, EvaluationRun, JsonValue } from "@lens/contracts";

import {
  attributesRecord,
  defaultRedactionPatterns,
  evaluationDataType,
  evaluationHash,
  evaluationMetadata,
  evaluationOutcome,
  evaluationPayload,
  evaluationPayloadStatus,
  firstStringAttribute,
  isoAttribute,
  logTimestamp,
  type NormalizeEvaluationsResult,
  type NormalizeOptions,
  nullableValidSpanId,
  nullableValidTraceId,
  optionalFiniteDecimalAttribute,
  optionalNumberAttribute,
  redact,
  stringArrayAttribute,
  stringAttribute,
  validSpanId,
  validTraceId,
} from "./normalization.js";

import type { OtlpLogsExportRequest } from "./types.js";

export function normalizeOtlpLogsRequest(
  request: OtlpLogsExportRequest,
  options: NormalizeOptions,
): NormalizeEvaluationsResult {
  const evaluations: EvaluationResult[] = [];
  const runs: EvaluationRun[] = [];
  const errors: string[] = [];
  const now = options.now ?? new Date();
  const expiresAt =
    options.retentionDays === null
      ? null
      : new Date(now.getTime() + options.retentionDays * 86_400_000).toISOString();
  const patterns = [...defaultRedactionPatterns, ...(options.redactionPatterns ?? [])];
  let rejectedLogRecords = 0;
  let ignoredLogRecords = 0;
  let sequence = 0n;

  for (const resourceLogs of request.resourceLogs) {
    const resourceAttributes = redact(attributesRecord(resourceLogs.resource.attributes), patterns);
    for (const scopeLogs of resourceLogs.scopeLogs) {
      for (const record of scopeLogs.logRecords) {
        const attributes = redact(attributesRecord(record.attributes), patterns);
        const eventName = record.eventName || stringAttribute(attributes, "event.name") || "";
        if (eventName === "anvia.eval.run.started" || eventName === "anvia.eval.run.finished") {
          const normalized = normalizeEvaluationRun({
            attributes,
            resourceAttributes,
            eventName,
            record,
            options,
            expiresAt,
            now,
            sequence,
          });
          sequence += 1n;
          if (typeof normalized === "string") {
            rejectedLogRecords += 1;
            errors.push(normalized);
          } else {
            runs.push(normalized);
          }
          continue;
        }
        if (eventName !== "gen_ai.evaluation.result") {
          ignoredLogRecords += 1;
          continue;
        }
        const metricName = stringAttribute(attributes, "gen_ai.evaluation.name");
        if (metricName === null) {
          rejectedLogRecords += 1;
          errors.push("Evaluation log is missing gen_ai.evaluation.name");
          continue;
        }
        const timestamp = logTimestamp(record.timeUnixNano, record.observedTimeUnixNano, now);
        if (timestamp === undefined) {
          rejectedLogRecords += 1;
          errors.push(`Evaluation ${metricName} has an invalid timestamp`);
          continue;
        }
        const traceId = validTraceId(record.traceId)
          ? record.traceId
          : nullableValidTraceId(stringAttribute(attributes, "anvia.eval.target.trace_id"));
        const observationId = validSpanId(record.spanId)
          ? record.spanId
          : nullableValidSpanId(stringAttribute(attributes, "anvia.eval.target.observation_id"));
        const scoreLabel = stringAttribute(attributes, "gen_ai.evaluation.score.label");
        const outcome = evaluationOutcome(
          stringAttribute(attributes, "anvia.eval.outcome"),
          scoreLabel,
        );
        const dataType = evaluationDataType(stringAttribute(attributes, "anvia.eval.data_type"));
        const numericValue = optionalFiniteDecimalAttribute(attributes, [
          "gen_ai.evaluation.score.value",
        ]);
        const categoricalValue =
          dataType === "CATEGORICAL" || numericValue === undefined ? scoreLabel : null;
        const ingestedAt = now.toISOString();
        const ingestVersion = (BigInt(now.getTime()) * 1_000_000n + sequence).toString();
        sequence += 1n;
        const suiteName = stringAttribute(attributes, "anvia.eval.suite.name") ?? "unspecified";
        const caseId = stringAttribute(attributes, "anvia.eval.case.id");
        const id =
          stringAttribute(attributes, "anvia.eval.id") ??
          evaluationHash(
            options.projectId,
            traceId,
            observationId,
            timestamp,
            suiteName,
            caseId,
            metricName,
          );
        evaluations.push({
          projectId: options.projectId,
          id,
          runId: stringAttribute(attributes, "anvia.eval.run.id"),
          timestamp,
          traceId,
          observationId,
          responseId: stringAttribute(attributes, "gen_ai.response.id"),
          suiteName,
          caseId,
          metricName,
          outcome,
          dataType,
          numericValue: numericValue ?? null,
          categoricalValue,
          explanation: stringAttribute(attributes, "gen_ai.evaluation.explanation"),
          payload: evaluationPayload(attributes),
          payloadStatus: evaluationPayloadStatus(attributes),
          configId: stringAttribute(attributes, "anvia.eval.config_id"),
          serviceName:
            stringAttribute(resourceAttributes, "service.name") ??
            stringAttribute(attributes, "service.name") ??
            "unknown-service",
          environment:
            firstStringAttribute(attributes, resourceAttributes, [
              "deployment.environment.name",
              "deployment.environment",
              "langfuse.environment",
            ]) ?? "default",
          release: firstStringAttribute(attributes, resourceAttributes, [
            "anvia.release",
            "langfuse.release",
          ]),
          metadata: evaluationMetadata(attributes),
          expiresAt,
          ingestedAt,
          ingestVersion,
        });
      }
    }
  }
  return { evaluations, runs, rejectedLogRecords, ignoredLogRecords, errors };
}

function normalizeEvaluationRun(args: {
  attributes: Record<string, JsonValue>;
  resourceAttributes: Record<string, JsonValue>;
  eventName: string;
  record: OtlpLogsExportRequest["resourceLogs"][number]["scopeLogs"][number]["logRecords"][number];
  options: NormalizeOptions;
  expiresAt: string | null;
  now: Date;
  sequence: bigint;
}): EvaluationRun | string {
  const id = stringAttribute(args.attributes, "anvia.eval.run.id");
  if (id === null || id.length > 128) return "Evaluation run is missing a valid anvia.eval.run.id";
  const suiteName = stringAttribute(args.attributes, "anvia.eval.suite.name");
  if (suiteName === null) return `Evaluation run ${id} is missing anvia.eval.suite.name`;
  const logTime = logTimestamp(
    args.record.timeUnixNano,
    args.record.observedTimeUnixNano,
    args.now,
  );
  if (logTime === undefined) return `Evaluation run ${id} has an invalid timestamp`;
  const startedAt = isoAttribute(args.attributes, "anvia.eval.run.started_at") ?? logTime;
  const terminal = args.eventName === "anvia.eval.run.finished";
  const rawStatus = stringAttribute(args.attributes, "anvia.eval.run.status");
  const status = terminal
    ? rawStatus === "failed"
      ? "failed"
      : rawStatus === "completed"
        ? "completed"
        : undefined
    : "running";
  if (status === undefined) return `Evaluation run ${id} has an invalid terminal status`;
  const completedAt = terminal
    ? (isoAttribute(args.attributes, "anvia.eval.run.completed_at") ?? logTime)
    : null;
  const ingestedAt = args.now.toISOString();
  const metadata = args.attributes["anvia.eval.run.metadata"];
  return {
    projectId: args.options.projectId,
    id,
    status,
    suiteName,
    startedAt,
    completedAt,
    durationMs: terminal
      ? (optionalNumberAttribute(args.attributes, ["anvia.eval.run.duration_ms"]) ?? 0)
      : null,
    caseCount: optionalNumberAttribute(args.attributes, ["anvia.eval.run.case_count"]) ?? 0,
    metricNames: stringArrayAttribute(args.attributes, "anvia.eval.run.metric_names"),
    passed: terminal
      ? (optionalNumberAttribute(args.attributes, ["anvia.eval.run.passed"]) ?? null)
      : null,
    failed: terminal
      ? (optionalNumberAttribute(args.attributes, ["anvia.eval.run.failed"]) ?? null)
      : null,
    invalid: terminal
      ? (optionalNumberAttribute(args.attributes, ["anvia.eval.run.invalid"]) ?? null)
      : null,
    serviceName:
      stringAttribute(args.resourceAttributes, "service.name") ??
      stringAttribute(args.attributes, "service.name") ??
      "unknown-service",
    environment:
      firstStringAttribute(args.attributes, args.resourceAttributes, [
        "deployment.environment.name",
        "deployment.environment",
      ]) ?? "default",
    release: firstStringAttribute(args.attributes, args.resourceAttributes, ["anvia.release"]),
    datasetName: stringAttribute(args.attributes, "anvia.eval.run.dataset.name"),
    datasetVersion: stringAttribute(args.attributes, "anvia.eval.run.dataset.version"),
    metadata:
      typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : {},
    expiresAt: args.expiresAt,
    ingestedAt,
    ingestVersion: (BigInt(args.now.getTime()) * 1_000_000n + args.sequence).toString(),
    stateVersion: terminal ? 2 : 1,
  };
}
