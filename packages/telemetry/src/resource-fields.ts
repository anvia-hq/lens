import type { JsonValue } from "@lens/contracts";
import { firstStringAttribute, stringAttribute } from "./attributes.js";

export function serviceName(
  attributes: Record<string, JsonValue>,
  resourceAttributes: Record<string, JsonValue>,
): string {
  return (
    stringAttribute(resourceAttributes, "service.name") ??
    stringAttribute(attributes, "service.name") ??
    "unknown-service"
  );
}

export function environment(
  attributes: Record<string, JsonValue>,
  resourceAttributes: Record<string, JsonValue>,
): string {
  return (
    firstStringAttribute(attributes, resourceAttributes, [
      "deployment.environment.name",
      "deployment.environment",
      "langfuse.environment",
    ]) ?? "default"
  );
}

export function release(
  attributes: Record<string, JsonValue>,
  resourceAttributes: Record<string, JsonValue>,
): string | null {
  return firstStringAttribute(attributes, resourceAttributes, [
    "anvia.release",
    "langfuse.release",
  ]);
}

export function serviceVersion(
  attributes: Record<string, JsonValue>,
  resourceAttributes: Record<string, JsonValue>,
): string | null {
  return firstStringAttribute(resourceAttributes, attributes, ["service.version"]);
}
