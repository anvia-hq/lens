import type { JsonValue, NormalizedSpan, ObservationKind, SpanStatus } from "@lens/contracts";
import { observationKinds } from "@lens/contracts";
import { firstPayload, optionalDecimalAttribute, stringAttribute } from "./attributes.js";
import type { OtlpSpan } from "./types.js";

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
  if (code === 1 || isLangfuseObservation) return "ok";
  return "unset";
}

export function reportedCosts(
  details: Record<string, JsonValue> | undefined,
  attributes: Record<string, JsonValue>,
): Pick<NormalizedSpan, "inputCost" | "outputCost" | "totalCost"> {
  const scalarInput = optionalDecimalAttribute(attributes, ["anvia.usage.input_cost"]);
  const scalarOutput = optionalDecimalAttribute(attributes, ["anvia.usage.output_cost"]);
  const scalarTotal = optionalDecimalAttribute(attributes, [
    "anvia.usage.total_cost",
    "gen_ai.usage.cost",
  ]);
  if (details === undefined) {
    return {
      inputCost: scalarInput ?? null,
      outputCost: scalarOutput ?? null,
      totalCost:
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
    inputCost: sumMatching("input") ?? scalarInput ?? null,
    outputCost: sumMatching("output") ?? scalarOutput ?? null,
    totalCost:
      explicitTotal ??
      scalarTotal ??
      (buckets.length === 0 ? null : buckets.reduce((sum, [, value]) => sum + value, 0)),
  };
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

export function generationModel(attributes: Record<string, JsonValue>): string | null {
  const legacyModel = stringAttribute(attributes, "anvia.generation.model");
  const explicitLegacyModel = legacyModel?.trim().toLowerCase() === "default" ? null : legacyModel;

  return (
    stringAttribute(attributes, "langfuse.observation.model.name") ??
    stringAttribute(attributes, "anvia.generation.model_id") ??
    explicitLegacyModel ??
    stringAttribute(attributes, "gen_ai.request.model") ??
    stringAttribute(attributes, "gen_ai.response.model") ??
    stringAttribute(attributes, "anvia.generation.default_model") ??
    legacyModel
  );
}

function hasPrefix(attributes: Record<string, JsonValue>, prefix: string): boolean {
  return Object.keys(attributes).some((key) => key.startsWith(prefix));
}
