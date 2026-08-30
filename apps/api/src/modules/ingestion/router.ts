import { createHash } from "node:crypto";
import {
  decodeOtlpRequest,
  encodeOtlpResponse,
  normalizeOtlpRequest,
  parseOtlpContentType,
} from "@lens/telemetry";
import { Hono } from "hono";
import { apiError } from "../../utils/http.js";
import type { ApiMetrics } from "../../utils/metrics.js";
import { parseRetentionDays } from "../../utils/project.js";
import { withinFixedWindowRateLimit } from "../../utils/rate-limit.js";
import { parseBasicAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { IngestionBodyError, readIngestionBody } from "./body.js";
import { queueHasCapacity } from "./capacity.js";
import { authenticateIngestionKey, recordProjectKeyUsage } from "./services.js";

export const createIngestionRouter = (deps: ApiDependencies, metrics: ApiMetrics) =>
  new Hono<AppEnv>().post("/", async (c) => {
    const startedAt = performance.now();
    const contentType = parseOtlpContentType(c.req.header("content-type"));
    if (contentType === undefined) {
      metrics.rejected.inc({ reason: "content_type" });
      return apiError(
        c,
        415,
        "unsupported_media_type",
        "Use application/json or application/x-protobuf",
      );
    }
    const credentials = parseBasicAuthorization(c.req.header("authorization"));
    if (credentials === undefined) {
      c.header("WWW-Authenticate", 'Basic realm="Lens ingestion"');
      return apiError(c, 401, "unauthorized", "Langfuse public and secret keys are required");
    }
    const key = await authenticateIngestionKey(
      deps.postgres.db,
      credentials.publicKey,
      credentials.secretKey,
      deps.config.INGESTION_KEY_PEPPER,
    );
    if (key === undefined || key.project.state !== "active") {
      metrics.rejected.inc({ reason: "auth" });
      return apiError(c, 401, "unauthorized", "Invalid or revoked ingestion key");
    }
    if (
      !(await withinFixedWindowRateLimit(
        deps.redis,
        "ingestion",
        key.project.id,
        deps.config.OTLP_RATE_LIMIT_PER_MINUTE,
      ))
    ) {
      metrics.rejected.inc({ reason: "rate_limit" });
      c.header("Retry-After", "60");
      return apiError(c, 429, "rate_limited", "Project ingestion rate limit exceeded");
    }
    try {
      if (!(await queueHasCapacity(deps.queues.ingest, deps.config.INGESTION_QUEUE_MAX_WAITING))) {
        metrics.rejected.inc({ reason: "queue_capacity" });
        c.header("Retry-After", "5");
        return apiError(c, 503, "ingestion_busy", "Telemetry ingestion is temporarily busy");
      }
    } catch (error) {
      metrics.rejected.inc({ reason: "queue_unavailable" });
      deps.logger.warn({ err: error, projectId: key.project.id }, "ingestion queue unavailable");
      c.header("Retry-After", "5");
      return apiError(c, 503, "ingestion_unavailable", "Telemetry ingestion is unavailable");
    }

    let bytes: Uint8Array;
    try {
      bytes = await readIngestionBody(c.req.raw, deps.config.OTLP_MAX_BODY_BYTES);
    } catch (error) {
      if (!(error instanceof IngestionBodyError)) throw error;
      metrics.rejected.inc({ reason: error.reason });
      const status =
        error.code === "payload_too_large" ? 413 : error.code === "invalid_gzip" ? 400 : 415;
      return apiError(c, status, error.code, error.message);
    }

    let normalized: ReturnType<typeof normalizeOtlpRequest>;
    try {
      normalized = normalizeOtlpRequest(decodeOtlpRequest(bytes, contentType), {
        projectId: key.project.id,
        retentionDays: parseRetentionDays(key.project.retentionDays),
      });
    } catch (error) {
      metrics.rejected.inc({ reason: "decode" });
      return apiError(
        c,
        400,
        "invalid_otlp",
        error instanceof Error ? error.message : "Invalid OTLP request",
      );
    }
    if (normalized.spans.length > 0) {
      try {
        const ingestId = createHash("sha256").update(key.project.id).update(bytes).digest("hex");
        await deps.queues.ingest.add(
          "ingest",
          {
            projectId: key.project.id,
            ingestId,
            receivedAt: new Date().toISOString(),
            spans: normalized.spans,
          },
          { jobId: `ingest-${ingestId}` },
        );
        metrics.accepted.inc(normalized.spans.length);
      } catch (error) {
        metrics.rejected.inc({ reason: "queue_unavailable" });
        deps.logger.warn({ err: error, projectId: key.project.id }, "failed to enqueue telemetry");
        c.header("Retry-After", "5");
        return apiError(c, 503, "ingestion_unavailable", "Telemetry ingestion is unavailable");
      }
    }
    if (normalized.rejectedSpans > 0) {
      metrics.rejected.inc({ reason: "invalid_span" }, normalized.rejectedSpans);
    }
    recordProjectKeyUsage(deps, key.apiKeyId, key.project.id);
    metrics.duration.observe((performance.now() - startedAt) / 1_000);
    const response = encodeOtlpResponse(
      contentType,
      normalized.rejectedSpans,
      normalized.errors.slice(0, 3).join("; "),
    );
    return new Response(response as BodyInit, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  });
