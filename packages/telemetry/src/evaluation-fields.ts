import { createHash } from "node:crypto";
import type {
  EvaluationOutcome,
  EvaluationPayload,
  EvaluationPayloadStatus,
  EvaluationResult,
  EvaluationSource,
  JsonValue,
} from "@lens/contracts";
import { firstPayload, stringAttribute } from "./attributes.js";

function toBoundedIso(date: Date): string | undefined {
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9_999) return undefined;
  return date.toISOString();
}

export function logTimestamp(
  primary: string,
  observed: string,
  fallback: Date,
): string | undefined {
  const raw = primary !== "0" ? primary : observed;
  if (raw === "0") return fallback.toISOString();
  try {
    const nano = BigInt(raw);
    if (nano < 0n) return undefined;
    const milliseconds = Number(nano / 1_000_000n);
    if (!Number.isFinite(milliseconds)) return undefined;
    return toBoundedIso(new Date(milliseconds));
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
  return toBoundedIso(new Date(value));
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

export function evaluationSource(value: string | null): EvaluationSource {
  return value === "end_user" ? "end_user" : "telemetry";
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
