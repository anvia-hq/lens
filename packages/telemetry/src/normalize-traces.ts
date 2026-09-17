import type { NormalizedSpan } from "@lens/contracts";

import {
  attributesRecord,
  firstStringArrayAttribute,
  jsonRecordAttribute,
  optionalNumberAttribute,
  stringAttribute,
  usageNumber,
} from "./attributes.js";
import { createIngestionContext } from "./ingestion-context.js";
import type { NormalizeOptions, NormalizeResult } from "./normalization-types.js";
import { validateSpan } from "./otlp-validation.js";
import { environment, release, serviceName, serviceVersion } from "./resource-fields.js";
import {
  classifySpan,
  extractedInput,
  extractedOutput,
  generationModel,
  langfuseObservationKind,
  reportedCosts,
  spanStatus,
} from "./trace-fields.js";

import type { OtlpExportRequest } from "./types.js";

export function normalizeOtlpRequest(
  request: OtlpExportRequest,
  options: NormalizeOptions,
): NormalizeResult {
  const spans: NormalizedSpan[] = [];
  const errors: string[] = [];
  const context = createIngestionContext(options);
  let rejectedSpans = 0;

  for (const resourceSpans of request.resourceSpans) {
    const resourceAttributes = context.redact(attributesRecord(resourceSpans.resource.attributes));
    for (const scopeSpans of resourceSpans.scopeSpans) {
      for (const span of scopeSpans.spans) {
        const validationError = validateSpan(span);
        if (validationError !== undefined) {
          rejectedSpans += 1;
          errors.push(validationError);
          continue;
        }
        const spanAttributes = context.redact(attributesRecord(span.attributes));
        const start = BigInt(span.startTimeUnixNano);
        const end = BigInt(span.endTimeUnixNano);
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
          serviceName: serviceName(spanAttributes, resourceAttributes),
          scopeName: scopeSpans.scope.name,
          scopeVersion: scopeSpans.scope.version,
          resourceAttributes,
          spanAttributes,
          events: span.events.map((event) => ({
            timeUnixNano: event.timeUnixNano,
            name: event.name,
            attributes: context.redact(attributesRecord(event.attributes)),
            droppedAttributesCount: event.droppedAttributesCount,
          })),
          links: span.links.map((link) => ({
            traceId: link.traceId,
            spanId: link.spanId,
            traceState: link.traceState,
            attributes: context.redact(attributesRecord(link.attributes)),
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
          environment: environment(spanAttributes, resourceAttributes),
          release: release(spanAttributes, resourceAttributes),
          serviceVersion: serviceVersion(spanAttributes, resourceAttributes),
          model: generationModel(spanAttributes),
          inputTokens,
          cachedInputTokens,
          outputTokens,
          totalTokens:
            optionalNumberAttribute(spanAttributes, ["anvia.usage.total_tokens"]) ??
            usageNumber(usageDetails, ["total", "total_tokens"]),
          inputCost: costs.inputCost,
          outputCost: costs.outputCost,
          totalCost: costs.totalCost,
          input,
          output,
          expiresAt: context.expiresAt,
          ingestedAt: context.ingestedAt,
          ingestVersion: context.nextIngestVersion(),
        });
      }
    }
  }
  return { spans, rejectedSpans, errors };
}
