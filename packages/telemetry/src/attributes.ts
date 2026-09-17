import type { JsonValue } from "@lens/contracts";
import type { OtlpKeyValue } from "./types.js";

export function attributesRecord(attributes: OtlpKeyValue[]): Record<string, JsonValue> {
  return Object.fromEntries(
    attributes.filter((item) => item.key.length > 0).map((item) => [item.key, item.value]),
  );
}

export function stringAttribute(attributes: Record<string, JsonValue>, key: string): string | null {
  const value = attributes[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function firstStringAttribute(
  primaryAttributes: Record<string, JsonValue>,
  fallbackAttributes: Record<string, JsonValue>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value =
      stringAttribute(primaryAttributes, key) ?? stringAttribute(fallbackAttributes, key);
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
  keys: readonly string[],
): string[] {
  for (const key of keys) {
    const value = stringArrayAttribute(attributes, key);
    if (value.length > 0) return value;
  }
  return [];
}

export function optionalNumberAttribute(
  attributes: Record<string, JsonValue>,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value !== "string" || !/^\d+$/.test(value)) continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return undefined;
}

export function usageNumber(
  value: Record<string, JsonValue> | undefined,
  keys: readonly string[],
): number {
  if (value === undefined) return 0;
  return optionalNumberAttribute(value, keys) ?? 0;
}

export function optionalDecimalAttribute(
  attributes: Record<string, JsonValue>,
  keys: readonly string[],
): number | undefined {
  return finiteDecimalAttribute(attributes, keys, false);
}

export function optionalFiniteDecimalAttribute(
  attributes: Record<string, JsonValue>,
  keys: readonly string[],
): number | undefined {
  return finiteDecimalAttribute(attributes, keys, true);
}

function finiteDecimalAttribute(
  attributes: Record<string, JsonValue>,
  keys: readonly string[],
  allowNegative: boolean,
): number | undefined {
  for (const key of keys) {
    const value = attributes[key];
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(parsed) && (allowNegative || parsed >= 0)) return parsed;
  }
  return undefined;
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

export function firstPayload(
  attributes: Record<string, JsonValue>,
  keys: readonly string[],
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
