import { createHash } from "node:crypto";
import {
  type EvaluationOutcome,
  type EvaluationPayload,
  type EvaluationPayloadStatus,
  type EvaluationResult,
  type EvaluationRun,
  type JsonValue,
  type NormalizedSpan,
  type ObservationKind,
  observationKinds,
  type SpanStatus,
} from "@lens/contracts";
import { decodeJsonLogsRequest, decodeJsonRequest } from "./json.js";
import {
  decodeProtobufLogsRequest,
  decodeProtobufRequest,
  encodeProtobufLogsResponse,
  encodeProtobufResponse,
} from "./protobuf.js";
import type { OtlpExportRequest, OtlpKeyValue, OtlpLogsExportRequest, OtlpSpan } from "./types.js";

export type OtlpContentType = "application/json" | "application/x-protobuf";

export const defaultRedactionPatterns = [
  "http.request.header.authorization",
  "http.request.header.cookie",
  "http.response.header.set-cookie",
  "db.connection_string",
  "*.api_key",
  "*.access_token",
  "*.password",
  "*.secret",
];

export function parseOtlpContentType(value: string | undefined): OtlpContentType | undefined {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "application/json" || contentType === "application/x-protobuf") {
    return contentType;
  }
  return undefined;
}

export function decodeOtlpRequest(
  bytes: Uint8Array,
  contentType: OtlpContentType,
): OtlpExportRequest {
  return contentType === "application/json"
    ? decodeJsonRequest(bytes)
    : decodeProtobufRequest(bytes);
}

export function decodeOtlpLogsRequest(
  bytes: Uint8Array,
  contentType: OtlpContentType,
): OtlpLogsExportRequest {
  return contentType === "application/json"
    ? decodeJsonLogsRequest(bytes)
    : decodeProtobufLogsRequest(bytes);
}

export function encodeOtlpResponse(
  contentType: OtlpContentType,
  rejectedSpans = 0,
  errorMessage = "",
): Uint8Array {
  if (contentType === "application/x-protobuf") {
    return encodeProtobufResponse(rejectedSpans, errorMessage);
  }
  const response =
    rejectedSpans === 0 && errorMessage.length === 0
      ? {}
      : { partialSuccess: { rejectedSpans: String(rejectedSpans), errorMessage } };
  return new TextEncoder().encode(JSON.stringify(response));
}

export function encodeOtlpLogsResponse(
  contentType: OtlpContentType,
  rejectedLogRecords = 0,
  errorMessage = "",
): Uint8Array {
  if (contentType === "application/x-protobuf") {
    return encodeProtobufLogsResponse(rejectedLogRecords, errorMessage);
  }
  const response =
    rejectedLogRecords === 0 && errorMessage.length === 0
      ? {}
      : { partialSuccess: { rejectedLogRecords: String(rejectedLogRecords), errorMessage } };
  return new TextEncoder().encode(JSON.stringify(response));
}

export type NormalizeOptions = {
  projectId: string;
  retentionDays: number | null;
  redactionPatterns?: string[];
  now?: Date;
};

export type NormalizeResult = {
  spans: NormalizedSpan[];
  rejectedSpans: number;
  errors: string[];
};

export type NormalizeEvaluationsResult = {
  evaluations: EvaluationResult[];
  runs: EvaluationRun[];
  rejectedLogRecords: number;
  ignoredLogRecords: number;
  errors: string[];
};

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

export function normalizeOtlpRequest(
  request: OtlpExportRequest,
  options: NormalizeOptions,
): NormalizeResult {
  const spans: NormalizedSpan[] = [];
  const errors: string[] = [];
  const now = options.now ?? new Date();
  const expiresAt =
    options.retentionDays === null
      ? null
      : new Date(now.getTime() + options.retentionDays * 86_400_000).toISOString();
  const patterns = [...defaultRedactionPatterns, ...(options.redactionPatterns ?? [])];
  let rejectedSpans = 0;
  let sequence = 0n;

  for (const resourceSpans of request.resourceSpans) {
    const resourceAttributes = redact(
      attributesRecord(resourceSpans.resource.attributes),
      patterns,
    );
    for (const scopeSpans of resourceSpans.scopeSpans) {
      for (const span of scopeSpans.spans) {
        const validationError = validateSpan(span);
        if (validationError !== undefined) {
          rejectedSpans += 1;
          errors.push(validationError);
          continue;
        }
        const spanAttributes = redact(attributesRecord(span.attributes), patterns);
        const start = BigInt(span.startTimeUnixNano);
        const end = BigInt(span.endTimeUnixNano);
        const ingestedAt = now.toISOString();
        const ingestVersion = (BigInt(now.getTime()) * 1_000_000n + sequence).toString();
        sequence += 1n;
        const serviceName =
          stringAttribute(resourceAttributes, "service.name") ??
          stringAttribute(spanAttributes, "service.name") ??
          "unknown-service";
        const langfuseKind = langfuseObservationKind(spanAttributes);
        const observationKind = classifySpan(span, spanAttributes, langfuseKind);
        const input = extractedInput(observationKind, spanAttributes);
        const output = extractedOutput(observationKind, spanAttributes);
        const usageDetails = jsonRecordAttribute(
          spanAttributes,
          "langfuse.observation.usage_details",
        );
        const costs = reportedCosts(
          jsonRecordAttribute(spanAttributes, "langfuse.observation.cost_details"),
          spanAttributes,
        );
        const inputTokens =
          optionalNumberAttribute(spanAttributes, [
            "anvia.usage.input_tokens",
            "gen_ai.usage.input_tokens",
          ]) ?? usageNumber(usageDetails, ["input", "input_tokens", "prompt_tokens"]);
        const cachedInputTokens = Math.min(
          inputTokens,
          optionalNumberAttribute(spanAttributes, [
            "anvia.usage.cached_input_tokens",
            "gen_ai.usage.cached_input_tokens",
          ]) ??
            usageNumber(usageDetails, [
              "cached_input_tokens",
              "cache_read_input_tokens",
              "input_cache_read",
            ]),
        );
        const outputTokens =
          optionalNumberAttribute(spanAttributes, [
            "anvia.usage.output_tokens",
            "gen_ai.usage.output_tokens",
          ]) ?? usageNumber(usageDetails, ["output", "output_tokens", "completion_tokens"]);
        spans.push({
          projectId: options.projectId,
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId.length > 0 ? span.parentSpanId : null,
          traceState: span.traceState,
          name: span.name || "unnamed-span",
          kind: span.kind,
          observationKind,
          status: spanStatus(span.status.code, spanAttributes, langfuseKind !== undefined),
          statusMessage:
            span.status.message ||
            stringAttribute(spanAttributes, "langfuse.observation.status_message") ||
            "",
          startTimeUnixNano: start.toString(),
          endTimeUnixNano: end.toString(),
          durationNano: (end - start).toString(),
          serviceName,
          scopeName: scopeSpans.scope.name,
          scopeVersion: scopeSpans.scope.version,
          resourceAttributes,
          spanAttributes,
          events: span.events.map((event) => ({
            timeUnixNano: event.timeUnixNano,
            name: event.name,
            attributes: redact(attributesRecord(event.attributes), patterns),
            droppedAttributesCount: event.droppedAttributesCount,
          })),
          links: span.links.map((link) => ({
            traceId: link.traceId,
            spanId: link.spanId,
            traceState: link.traceState,
            attributes: redact(attributesRecord(link.attributes), patterns),
            droppedAttributesCount: link.droppedAttributesCount,
            flags: link.flags,
          })),
          traceName:
            stringAttribute(spanAttributes, "langfuse.trace.name") ??
            stringAttribute(spanAttributes, "anvia.trace.name"),
          userId:
            stringAttribute(spanAttributes, "user.id") ??
            stringAttribute(spanAttributes, "langfuse.user.id") ??
            stringAttribute(spanAttributes, "anvia.trace.user_id"),
          sessionId:
            stringAttribute(spanAttributes, "session.id") ??
            stringAttribute(spanAttributes, "langfuse.session.id") ??
            stringAttribute(spanAttributes, "anvia.trace.session_id"),
          tags: firstStringArrayAttribute(spanAttributes, [
            "langfuse.trace.tags",
            "anvia.trace.tags",
          ]),
          version:
            stringAttribute(spanAttributes, "langfuse.version") ??
            stringAttribute(spanAttributes, "anvia.trace.version"),
          environment:
            firstStringAttribute(spanAttributes, resourceAttributes, [
              "langfuse.environment",
              "deployment.environment.name",
              "deployment.environment",
            ]) ?? "default",
          release: firstStringAttribute(spanAttributes, resourceAttributes, [
            "anvia.release",
            "langfuse.release",
          ]),
          serviceVersion: firstStringAttribute(resourceAttributes, spanAttributes, [
            "service.version",
          ]),
          model:
            stringAttribute(spanAttributes, "langfuse.observation.model.name") ??
            stringAttribute(spanAttributes, "anvia.generation.model") ??
            stringAttribute(spanAttributes, "gen_ai.request.model") ??
            stringAttribute(spanAttributes, "gen_ai.response.model"),
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens:
            optionalNumberAttribute(spanAttributes, ["anvia.usage.total_tokens"]) ??
            usageNumber(usageDetails, ["total", "total_tokens"]),
          inputCost: costs.input,
          outputCost: costs.output,
          totalCost: costs.total,
          input,
          output,
          expiresAt,
          ingestedAt,
          ingestVersion,
        });
      }
    }
  }
  return { spans, rejectedSpans, errors };
}

function validateSpan(span: OtlpSpan): string | undefined {
  if (!/^[0-9a-f]{32}$/.test(span.traceId) || /^0+$/.test(span.traceId)) {
    return `Invalid trace ID for span ${span.name || "<unnamed>"}`;
  }
  if (!/^[0-9a-f]{16}$/.test(span.spanId) || /^0+$/.test(span.spanId)) {
    return `Invalid span ID for span ${span.name || "<unnamed>"}`;
  }
  try {
    const start = BigInt(span.startTimeUnixNano);
    const end = BigInt(span.endTimeUnixNano);
    if (start <= 0n || end < start) return `Invalid timestamps for span ${span.spanId}`;
  } catch {
    return `Invalid timestamps for span ${span.spanId}`;
  }
  return undefined;
}

function logTimestamp(primary: string, observed: string, fallback: Date): string | undefined {
  const raw = primary !== "0" ? primary : observed;
  if (raw === "0") return fallback.toISOString();
  try {
    const milliseconds = Number(BigInt(raw) / 1_000_000n);
    if (!Number.isFinite(milliseconds)) return undefined;
    const value = new Date(milliseconds);
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  } catch {
    return undefined;
  }
}

function isoAttribute(attributes: Record<string, JsonValue>, key: string): string | undefined {
  const value = stringAttribute(attributes, key);
  if (value === null) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function evaluationOutcome(value: string | null, label: string | null): EvaluationOutcome {
  const candidate = (value ?? label)?.toLowerCase();
  return candidate === "pass" || candidate === "fail" || candidate === "invalid"
    ? candidate
    : "unknown";
}

function evaluationDataType(value: string | null): EvaluationResult["dataType"] {
  const candidate = value?.toUpperCase();
  return candidate === "NUMERIC" || candidate === "CATEGORICAL" || candidate === "BOOLEAN"
    ? candidate
    : null;
}

function evaluationPayloadStatus(attributes: Record<string, JsonValue>): EvaluationPayloadStatus {
  const candidate = stringAttribute(attributes, "anvia.eval.payload.status");
  return candidate === "captured" ||
    candidate === "size_limit" ||
    candidate === "serialization_error"
    ? candidate
    : "not_requested";
}

function evaluationPayload(attributes: Record<string, JsonValue>): EvaluationPayload | null {
  const value = firstPayload(attributes, ["anvia.eval.payload"]);
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("input" in value)) {
    return null;
  }
  return value as EvaluationPayload;
}

function evaluationMetadata(attributes: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => key.endsWith(".metadata")),
  );
}

function evaluationHash(...values: Array<string | null>): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function validTraceId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value);
}

function validSpanId(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value) && !/^0+$/.test(value);
}

function nullableValidTraceId(value: string | null): string | null {
  return value !== null && validTraceId(value.toLowerCase()) ? value.toLowerCase() : null;
}

function nullableValidSpanId(value: string | null): string | null {
  return value !== null && validSpanId(value.toLowerCase()) ? value.toLowerCase() : null;
}

function attributesRecord(attributes: OtlpKeyValue[]): Record<string, JsonValue> {
  return Object.fromEntries(
    attributes.filter((item) => item.key.length > 0).map((item) => [item.key, item.value]),
  );
}

function classifySpan(
  span: OtlpSpan,
  attributes: Record<string, JsonValue>,
  langfuseKind: ObservationKind | undefined,
): ObservationKind {
  if (langfuseKind !== undefined) return langfuseKind;
  if (hasPrefix(attributes, "anvia.generation.")) return "generation";
  if (hasPrefix(attributes, "anvia.tool.")) return "tool";
  if (hasPrefix(attributes, "anvia.run.") || hasPrefix(attributes, "anvia.child_agent.")) {
    return "agent";
  }
  const operation = stringAttribute(attributes, "gen_ai.operation.name")?.toLowerCase();
  if (operation?.includes("tool")) return "tool";
  if (operation !== undefined || hasPrefix(attributes, "gen_ai.request.")) return "generation";
  if (span.name.startsWith("agent.")) return "agent";
  return "span";
}

function hasPrefix(attributes: Record<string, JsonValue>, prefix: string): boolean {
  return Object.keys(attributes).some((key) => key.startsWith(prefix));
}

function langfuseObservationKind(
  attributes: Record<string, JsonValue>,
): ObservationKind | undefined {
  const value = stringAttribute(attributes, "langfuse.observation.type")?.toLowerCase();
  return observationKinds.find((kind) => kind === value);
}

function spanStatus(
  code: number,
  attributes: Record<string, JsonValue>,
  isLangfuseObservation: boolean,
): SpanStatus {
  const level = stringAttribute(attributes, "langfuse.observation.level")?.toUpperCase();
  if (code === 2 || level === "ERROR") return "error";
  if (code === 1) return "ok";
  if (isLangfuseObservation) return "ok";
  return "unset";
}

function stringAttribute(attributes: Record<string, JsonValue>, key: string): string | null {
  const value = attributes[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstStringAttribute(
  spanAttributes: Record<string, JsonValue>,
  resourceAttributes: Record<string, JsonValue>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = stringAttribute(spanAttributes, key) ?? stringAttribute(resourceAttributes, key);
    if (value !== null) return value;
  }
  return null;
}

function stringArrayAttribute(attributes: Record<string, JsonValue>, key: string): string[] {
  const value = attributes[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function firstStringArrayAttribute(
  attributes: Record<string, JsonValue>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const value = stringArrayAttribute(attributes, key);
    if (value.length > 0) return value;
  }
  return [];
}

function optionalNumberAttribute(
  attributes: Record<string, JsonValue>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return undefined;
}

function usageNumber(value: Record<string, JsonValue> | undefined, keys: string[]): number {
  if (value === undefined) return 0;
  return optionalNumberAttribute(value, keys) ?? 0;
}

function optionalDecimalAttribute(
  attributes: Record<string, JsonValue>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function optionalFiniteDecimalAttribute(
  attributes: Record<string, JsonValue>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function reportedCosts(
  details: Record<string, JsonValue> | undefined,
  attributes: Record<string, JsonValue>,
): { input: number | null; output: number | null; total: number | null } {
  const scalarInput = optionalDecimalAttribute(attributes, ["anvia.usage.input_cost"]);
  const scalarOutput = optionalDecimalAttribute(attributes, ["anvia.usage.output_cost"]);
  const scalarTotal = optionalDecimalAttribute(attributes, [
    "anvia.usage.total_cost",
    "gen_ai.usage.cost",
  ]);
  if (details === undefined) {
    return {
      input: scalarInput ?? null,
      output: scalarOutput ?? null,
      total:
        scalarTotal ??
        (scalarInput !== undefined || scalarOutput !== undefined
          ? (scalarInput ?? 0) + (scalarOutput ?? 0)
          : null),
    };
  }

  const entries = Object.entries(details).flatMap(([key, value]) => {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? [[key, parsed] as const] : [];
  });
  const explicitTotal = optionalDecimalAttribute(details, ["total", "totalCost", "total_cost"]);
  const buckets = entries.filter(
    ([key]) => !["total", "totalcost", "total_cost"].includes(key.toLowerCase()),
  );
  const sumMatching = (part: "input" | "output") => {
    const values = buckets.filter(([key]) => key.toLowerCase().includes(part));
    return values.length === 0 ? null : values.reduce((sum, [, value]) => sum + value, 0);
  };
  return {
    input: sumMatching("input") ?? scalarInput ?? null,
    output: sumMatching("output") ?? scalarOutput ?? null,
    total:
      explicitTotal ??
      scalarTotal ??
      (buckets.length === 0 ? null : buckets.reduce((sum, [, value]) => sum + value, 0)),
  };
}

function jsonRecordAttribute(
  attributes: Record<string, JsonValue>,
  key: string,
): Record<string, JsonValue> | undefined {
  const value = attributes[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, JsonValue>)
      : undefined;
  } catch {
    return undefined;
  }
}

function extractedInput(
  kind: ObservationKind,
  attributes: Record<string, JsonValue>,
): JsonValue | null {
  const keys =
    kind === "generation"
      ? [
          "langfuse.observation.input",
          "langfuse.trace.input",
          "anvia.generation.input",
          "gen_ai.input.messages",
        ]
      : kind === "tool"
        ? ["langfuse.observation.input", "langfuse.trace.input", "anvia.tool.args"]
        : ["langfuse.observation.input", "langfuse.trace.input", "anvia.run.prompt"];
  return firstPayload(attributes, keys);
}

function extractedOutput(
  kind: ObservationKind,
  attributes: Record<string, JsonValue>,
): JsonValue | null {
  const keys =
    kind === "generation"
      ? [
          "langfuse.observation.output",
          "langfuse.trace.output",
          "anvia.generation.output",
          "anvia.generation.output_text",
          "gen_ai.output.messages",
        ]
      : kind === "tool"
        ? ["langfuse.observation.output", "langfuse.trace.output", "anvia.tool.result"]
        : ["langfuse.observation.output", "langfuse.trace.output", "anvia.run.output"];
  return firstPayload(attributes, keys);
}

function firstPayload(attributes: Record<string, JsonValue>, keys: string[]): JsonValue | null {
  for (const key of keys) {
    const value = attributes[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as JsonValue;
    } catch {
      return value;
    }
  }
  return null;
}

function redact(
  attributes: Record<string, JsonValue>,
  patterns: string[],
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      patterns.some((pattern) => globMatch(pattern, key)) ? "[REDACTED]" : value,
    ]),
  );
}

export function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export type { OtlpExportRequest } from "./types.js";
