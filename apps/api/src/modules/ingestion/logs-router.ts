import { createHash } from "node:crypto";
import {
  decodeOtlpLogsRequest,
  encodeOtlpLogsResponse,
  normalizeOtlpLogsRequest,
  parseOtlpContentType,
} from "@lens/telemetry";
import { Hono } from "hono";
import { apiError } from "../../utils/http.js";
import type { IngestionMetrics } from "../../utils/metrics.js";
import { parseRetentionDays } from "../../utils/project.js";
import { parseBasicAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { IngestionBodyError, readIngestionBody } from "./body.js";
import { authenticateIngestionKey, recordProjectKeyUsage, withinRateLimit } from "./services.js";

export const createLogsIngestionRouter = (deps: ApiDependencies, metrics: IngestionMetrics) =>
  new Hono<AppEnv>().post("/", async (c) => {
    const startedAt = performance.now();
    const contentType = parseOtlpContentType(c.req.header("content-type"));
    if (contentType === undefined) {
      metrics.evaluationLogsRejected.inc({ reason: "content_type" });
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
      return apiError(c, 401, "unauthorized", "Lens public and secret keys are required");
    }
    const key = await authenticateIngestionKey(
      deps.postgres.db,
      credentials.publicKey,
      credentials.secretKey,
      deps.config.INGESTION_KEY_PEPPER,
    );
    if (key === undefined || key.project.state !== "active") {
      metrics.evaluationLogsRejected.inc({ reason: "auth" });
      return apiError(c, 401, "unauthorized", "Invalid or revoked ingestion key");
    }
    if (
      !(await withinRateLimit(
        deps.redis,
        `${key.project.id}:logs`,
        deps.config.OTLP_RATE_LIMIT_PER_MINUTE,
      ))
    ) {
      metrics.evaluationLogsRejected.inc({ reason: "rate_limit" });
      c.header("Retry-After", "60");
      return apiError(c, 429, "rate_limited", "Project ingestion rate limit exceeded");
    }

    let bytes: Uint8Array;
    try {
      bytes = await readIngestionBody(c.req.raw, deps.config.OTLP_MAX_BODY_BYTES);
    } catch (error) {
      if (!(error instanceof IngestionBodyError)) throw error;
      metrics.evaluationLogsRejected.inc({ reason: error.reason });
      const status =
        error.code === "payload_too_large" ? 413 : error.code === "invalid_gzip" ? 400 : 415;
      return apiError(c, status, error.code, error.message);
    }

    try {
      const normalized = normalizeOtlpLogsRequest(decodeOtlpLogsRequest(bytes, contentType), {
        projectId: key.project.id,
        retentionDays: parseRetentionDays(key.project.retentionDays),
      });
      if (normalized.evaluations.length > 0 || normalized.runs.length > 0) {
        const ingestId = createHash("sha256").update(key.project.id).update(bytes).digest("hex");
        await deps.queues.evaluations.add(
          "ingest",
          {
            projectId: key.project.id,
            ingestId,
            receivedAt: new Date().toISOString(),
            evaluations: normalized.evaluations,
            runs: normalized.runs,
          },
          { jobId: `evaluations-${ingestId}` },
        );
        metrics.evaluationsAccepted.inc(normalized.evaluations.length);
      }
      if (normalized.rejectedLogRecords > 0) {
        metrics.evaluationLogsRejected.inc(
          { reason: "invalid_evaluation" },
          normalized.rejectedLogRecords,
        );
      }
      recordProjectKeyUsage(deps, key.apiKeyId, key.project.id);
      metrics.duration.observe((performance.now() - startedAt) / 1_000);
      const response = encodeOtlpLogsResponse(
        contentType,
        normalized.rejectedLogRecords,
        normalized.errors.slice(0, 3).join("; "),
      );
      return new Response(response as BodyInit, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    } catch (error) {
      metrics.evaluationLogsRejected.inc({ reason: "decode" });
      return apiError(
        c,
        400,
        "invalid_otlp",
        error instanceof Error ? error.message : "Invalid OTLP logs request",
      );
    }
  });
