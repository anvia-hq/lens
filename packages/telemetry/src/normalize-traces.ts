import type { JsonValue, NormalizedSpan } from "@lens/contracts";

import {
  attributesRecord,
  classifySpan,
  defaultRedactionPatterns,
  extractedInput,
  extractedOutput,
  firstStringArrayAttribute,
  firstStringAttribute,
  jsonRecordAttribute,
  langfuseObservationKind,
  type NormalizeOptions,
  type NormalizeResult,
  optionalNumberAttribute,
  redact,
  reportedCosts,
  spanStatus,
  stringAttribute,
  usageNumber,
  validateSpan,
} from "./normalization.js";

import type { OtlpExportRequest } from "./types.js";

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
  const patterns = defaultRedactionPatterns;
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
          model: generationModel(spanAttributes),
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

function generationModel(attributes: Record<string, JsonValue>): string | null {
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
