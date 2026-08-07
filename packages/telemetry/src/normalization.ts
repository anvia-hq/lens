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

import type { OtlpKeyValue, OtlpSpan } from "./types.js";

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

export type NormalizeOptions = {
  projectId: string;
  retentionDays: number | null;
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

export function validateSpan(span: OtlpSpan): string | undefined {
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

export function logTimestamp(
  primary: string,
  observed: string,
  fallback: Date,
): string | undefined {
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

export function isoAttribute(
  attributes: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = stringAttribute(attributes, key);
  if (value === null) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function evaluationOutcome(value: string | null, label: string | null): EvaluationOutcome {
  const candidate = (value ?? label)?.toLowerCase();
  return candidate === "pass" || candidate === "fail" || candidate === "invalid"
    ? candidate
    : "unknown";
}

export function evaluationDataType(value: string | null): EvaluationResult["dataType"] {
  const candidate = value?.toUpperCase();
  return candidate === "NUMERIC" || candidate === "CATEGORICAL" || candidate === "BOOLEAN"
    ? candidate
    : null;
}

export function evaluationPayloadStatus(
  attributes: Record<string, JsonValue>,
): EvaluationPayloadStatus {
  const candidate = stringAttribute(attributes, "anvia.eval.payload.status");
  return candidate === "captured" ||
    candidate === "size_limit" ||
    candidate === "serialization_error"
    ? candidate
    : "not_requested";
}

export function evaluationPayload(attributes: Record<string, JsonValue>): EvaluationPayload | null {
  const value = firstPayload(attributes, ["anvia.eval.payload"]);
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("input" in value)) {
    return null;
  }
  return value as EvaluationPayload;
}

export function evaluationMetadata(
  attributes: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([key]) => key.endsWith(".metadata")),
  );
}

export function evaluationHash(...values: Array<string | null>): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function validTraceId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value);
}

export function validSpanId(value: string): boolean {
  return /^[0-9a-f]{16}$/.test(value) && !/^0+$/.test(value);
}

export function nullableValidTraceId(value: string | null): string | null {
  return value !== null && validTraceId(value.toLowerCase()) ? value.toLowerCase() : null;
}

export function nullableValidSpanId(value: string | null): string | null {
  return value !== null && validSpanId(value.toLowerCase()) ? value.toLowerCase() : null;
}

export function attributesRecord(attributes: OtlpKeyValue[]): Record<string, JsonValue> {
  return Object.fromEntries(
    attributes.filter((item) => item.key.length > 0).map((item) => [item.key, item.value]),
  );
}

export function classifySpan(
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

export function hasPrefix(attributes: Record<string, JsonValue>, prefix: string): boolean {
  return Object.keys(attributes).some((key) => key.startsWith(prefix));
}

export function langfuseObservationKind(
  attributes: Record<string, JsonValue>,
): ObservationKind | undefined {
  const value = stringAttribute(attributes, "langfuse.observation.type")?.toLowerCase();
  return observationKinds.find((kind) => kind === value);
}

export function spanStatus(
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

export function stringAttribute(attributes: Record<string, JsonValue>, key: string): string | null {
  const value = attributes[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function firstStringAttribute(
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

export function stringArrayAttribute(attributes: Record<string, JsonValue>, key: string): string[] {
  const value = attributes[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function firstStringArrayAttribute(
  attributes: Record<string, JsonValue>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const value = stringArrayAttribute(attributes, key);
    if (value.length > 0) return value;
  }
  return [];
}

export function optionalNumberAttribute(
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

export function usageNumber(value: Record<string, JsonValue> | undefined, keys: string[]): number {
  if (value === undefined) return 0;
  return optionalNumberAttribute(value, keys) ?? 0;
}

export function optionalDecimalAttribute(
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

export function optionalFiniteDecimalAttribute(
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

export function reportedCosts(
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

export function jsonRecordAttribute(
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

export function extractedInput(
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

export function extractedOutput(
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

export function firstPayload(
  attributes: Record<string, JsonValue>,
  keys: string[],
): JsonValue | null {
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

export function redact(
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
