import type { EvaluationResult, EvaluationRun, JsonValue } from "@lens/contracts";
import {
  attributesRecord,
  optionalFiniteDecimalAttribute,
  optionalNumberAttribute,
  stringArrayAttribute,
  stringAttribute,
} from "./attributes.js";
import {
  evaluationDataType,
  evaluationHash,
  evaluationMetadata,
  evaluationOutcome,
  evaluationPayload,
  evaluationPayloadStatus,
  evaluationSource,
  isoAttribute,
  logTimestamp,
} from "./evaluation-fields.js";
import { createIngestionContext, type IngestionContext } from "./ingestion-context.js";
import type { NormalizeEvaluationsResult, NormalizeOptions } from "./normalization-types.js";
import {
  nullableValidSpanId,
  nullableValidTraceId,
  validSpanId,
  validTraceId,
} from "./otlp-validation.js";
import { environment, release, serviceName } from "./resource-fields.js";
import type { OtlpLogRecord, OtlpLogsExportRequest } from "./types.js";

const EVALUATION_EVENT = "gen_ai.evaluation.result";
const RUN_EVENTS = new Set(["anvia.eval.run.started", "anvia.eval.run.finished"]);

type RecordContext = {
  attributes: Record<string, JsonValue>;
  resourceAttributes: Record<string, JsonValue>;
  eventName: string;
  record: OtlpLogRecord;
  options: NormalizeOptions;
  ingestion: IngestionContext;
};

type NormalizedRecord =
  | { kind: "evaluation"; value: EvaluationResult }
  | { kind: "run"; value: EvaluationRun }
  | { kind: "ignored" }
  | { error: string; kind: "rejected" };

export function normalizeOtlpLogsRequest(
  request: OtlpLogsExportRequest,
  options: NormalizeOptions,
): NormalizeEvaluationsResult {
  const evaluations: EvaluationResult[] = [];
  const runs: EvaluationRun[] = [];
  const errors: string[] = [];
  const ingestion = createIngestionContext(options);
  let rejectedLogRecords = 0;
  let ignoredLogRecords = 0;

  for (const resourceLogs of request.resourceLogs) {
    const resourceAttributes = ingestion.redact(attributesRecord(resourceLogs.resource.attributes));
    for (const scopeLogs of resourceLogs.scopeLogs) {
      for (const record of scopeLogs.logRecords) {
        const attributes = ingestion.redact(attributesRecord(record.attributes));
        const eventName = record.eventName || stringAttribute(attributes, "event.name") || "";
        const normalized = normalizeLogRecord({
          attributes,
          resourceAttributes,
          eventName,
          record,
          options,
          ingestion,
        });

        if (normalized.kind === "evaluation") evaluations.push(normalized.value);
        else if (normalized.kind === "run") runs.push(normalized.value);
        else if (normalized.kind === "ignored") ignoredLogRecords += 1;
        else {
          rejectedLogRecords += 1;
          errors.push(normalized.error);
        }
      }
    }
  }

  return { evaluations, runs, rejectedLogRecords, ignoredLogRecords, errors };
}

function normalizeLogRecord(context: RecordContext): NormalizedRecord {
  if (RUN_EVENTS.has(context.eventName)) {
    const normalized = normalizeEvaluationRun(context);
    return typeof normalized === "string"
      ? { kind: "rejected", error: normalized }
      : { kind: "run", value: normalized };
  }
  if (context.eventName !== EVALUATION_EVENT) return { kind: "ignored" };

  const normalized = normalizeEvaluationResult(context);
  return typeof normalized === "string"
    ? { kind: "rejected", error: normalized }
    : { kind: "evaluation", value: normalized };
}

function normalizeEvaluationResult(context: RecordContext): EvaluationResult | string {
  const metricName = stringAttribute(context.attributes, "gen_ai.evaluation.name");
  if (metricName === null) return "Evaluation log is missing gen_ai.evaluation.name";

  const timestamp = logTimestamp(
    context.record.timeUnixNano,
    context.record.observedTimeUnixNano,
    context.ingestion.now,
  );
  if (timestamp === undefined) return `Evaluation ${metricName} has an invalid timestamp`;

  const traceId = validTraceId(context.record.traceId)
    ? context.record.traceId
    : nullableValidTraceId(stringAttribute(context.attributes, "anvia.eval.target.trace_id"));
  const observationId = validSpanId(context.record.spanId)
    ? context.record.spanId
    : nullableValidSpanId(stringAttribute(context.attributes, "anvia.eval.target.observation_id"));
  const scoreLabel = stringAttribute(context.attributes, "gen_ai.evaluation.score.label");
  const dataType = evaluationDataType(stringAttribute(context.attributes, "anvia.eval.data_type"));
  const numericValue = optionalFiniteDecimalAttribute(context.attributes, [
    "gen_ai.evaluation.score.value",
  ]);
  const suiteName = stringAttribute(context.attributes, "anvia.eval.suite.name") ?? "unspecified";
  const caseId = stringAttribute(context.attributes, "anvia.eval.case.id");
  const id =
    stringAttribute(context.attributes, "anvia.eval.id") ??
    evaluationHash(
      context.options.projectId,
      traceId,
      observationId,
      timestamp,
      suiteName,
      caseId,
      metricName,
    );

  return {
    projectId: context.options.projectId,
    id,
    runId: stringAttribute(context.attributes, "anvia.eval.run.id"),
    timestamp,
    traceId,
    observationId,
    responseId: stringAttribute(context.attributes, "gen_ai.response.id"),
    suiteName,
    caseId,
    metricName,
    outcome: evaluationOutcome(
      stringAttribute(context.attributes, "anvia.eval.outcome"),
      scoreLabel,
    ),
    dataType,
    numericValue: numericValue ?? null,
    categoricalValue: dataType === "CATEGORICAL" || numericValue === undefined ? scoreLabel : null,
    explanation: stringAttribute(context.attributes, "gen_ai.evaluation.explanation"),
    payload: evaluationPayload(context.attributes),
    payloadStatus: evaluationPayloadStatus(context.attributes),
    configId: stringAttribute(context.attributes, "anvia.eval.config_id"),
    serviceName: serviceName(context.attributes, context.resourceAttributes),
    environment: environment(context.attributes, context.resourceAttributes),
    release: release(context.attributes, context.resourceAttributes),
    metadata: evaluationMetadata(context.attributes),
    source: evaluationSource(stringAttribute(context.attributes, "anvia.eval.source")),
    reviewer: null,
    expiresAt: context.ingestion.expiresAt,
    ingestedAt: context.ingestion.ingestedAt,
    ingestVersion: context.ingestion.nextIngestVersion(),
  };
}

function normalizeEvaluationRun(context: RecordContext): EvaluationRun | string {
  const id = stringAttribute(context.attributes, "anvia.eval.run.id");
  if (id === null || id.length > 128) {
    return "Evaluation run is missing a valid anvia.eval.run.id";
  }
  const suiteName = stringAttribute(context.attributes, "anvia.eval.suite.name");
  if (suiteName === null) return `Evaluation run ${id} is missing anvia.eval.suite.name`;

  const logTime = logTimestamp(
    context.record.timeUnixNano,
    context.record.observedTimeUnixNano,
    context.ingestion.now,
  );
  if (logTime === undefined) return `Evaluation run ${id} has an invalid timestamp`;

  const terminal = context.eventName === "anvia.eval.run.finished";
  const rawStatus = stringAttribute(context.attributes, "anvia.eval.run.status");
  const status = terminal
    ? rawStatus === "failed" || rawStatus === "completed"
      ? rawStatus
      : undefined
    : "running";
  if (status === undefined) return `Evaluation run ${id} has an invalid terminal status`;

  const metadata = context.attributes["anvia.eval.run.metadata"];
  return {
    projectId: context.options.projectId,
    id,
    status,
    suiteName,
    startedAt: isoAttribute(context.attributes, "anvia.eval.run.started_at") ?? logTime,
    completedAt: terminal
      ? (isoAttribute(context.attributes, "anvia.eval.run.completed_at") ?? logTime)
      : null,
    durationMs: terminal
      ? (optionalNumberAttribute(context.attributes, ["anvia.eval.run.duration_ms"]) ?? 0)
      : null,
    caseCount: optionalNumberAttribute(context.attributes, ["anvia.eval.run.case_count"]) ?? 0,
    metricNames: stringArrayAttribute(context.attributes, "anvia.eval.run.metric_names"),
    passed: terminal
      ? (optionalNumberAttribute(context.attributes, ["anvia.eval.run.passed"]) ?? null)
      : null,
    failed: terminal
      ? (optionalNumberAttribute(context.attributes, ["anvia.eval.run.failed"]) ?? null)
      : null,
    invalid: terminal
      ? (optionalNumberAttribute(context.attributes, ["anvia.eval.run.invalid"]) ?? null)
      : null,
    serviceName: serviceName(context.attributes, context.resourceAttributes),
    environment: environment(context.attributes, context.resourceAttributes),
    release: release(context.attributes, context.resourceAttributes),
    datasetName: stringAttribute(context.attributes, "anvia.eval.run.dataset.name"),
    datasetVersion: stringAttribute(context.attributes, "anvia.eval.run.dataset.version"),
    promptName: stringAttribute(context.attributes, "anvia.eval.run.prompt.name"),
    promptVersion: stringAttribute(context.attributes, "anvia.eval.run.prompt.version"),
    metadata:
      typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : {},
    expiresAt: context.ingestion.expiresAt,
    ingestedAt: context.ingestion.ingestedAt,
    ingestVersion: context.ingestion.nextIngestVersion(),
    stateVersion: terminal ? 2 : 1,
  };
}
