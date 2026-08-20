import { createHash } from "node:crypto";
import { traceReviewInputSchema } from "@lens/contracts";
import {
  getSpan,
  getTrace,
  getTraceExpiration,
  getTraceSummary,
  insertEvaluations,
  listTraceFacets,
  listTraces,
} from "@lens/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { requireProjectAccess } from "../../utils/access.js";
import { apiError, requiredSession, safeJson } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { recordHumanReviewAlert } from "../alerts/events.js";
import { traceReviewResult } from "./review.js";
import { parseTraceRequest } from "./schema.js";

export const createTracesRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/traces", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseTraceRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      const page = await listTraces(deps.clickhouse, projectId, {
        ...parsed.filters,
        page: parsed.page,
        pageSize: parsed.pageSize,
        sort: parsed.sort,
        order: parsed.order,
      });
      return c.json(page);
    })
    .get("/:projectId/traces/facets", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = parseTraceRequest(c);
      if (typeof parsed === "string") return apiError(c, 400, "invalid_query", parsed);
      return c.json(await listTraceFacets(deps.clickhouse, projectId, parsed.filters));
    })
    .get("/:projectId/traces/:traceId", async (c) => {
      const startedAt = performance.now();
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const trace = await getTrace(deps.clickhouse, projectId, c.req.param("traceId"));
      if (trace === undefined) return apiError(c, 404, "not_found", "Trace not found");
      const body = JSON.stringify(trace);
      deps.logger.info(
        {
          projectId,
          traceId: trace.summary.traceId,
          spanCount: trace.spans.length,
          responseBytes: Buffer.byteLength(body),
          loadDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
        "trace detail loaded",
      );
      return cachedJson(c, body);
    })
    .get("/:projectId/traces/:traceId/spans/:spanId", async (c) => {
      const projectId = c.req.param("projectId");
      const access = await requireProjectAccess(
        deps.postgres.db,
        projectId,
        requiredSession(c).user.id,
      );
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const span = await getSpan(
        deps.clickhouse,
        projectId,
        c.req.param("traceId"),
        c.req.param("spanId"),
      );
      return span === undefined
        ? apiError(c, 404, "not_found", "Span not found")
        : cachedJson(c, JSON.stringify(span));
    })
    .put("/:projectId/traces/:traceId/review", async (c) => {
      const projectId = c.req.param("projectId");
      const session = requiredSession(c);
      const access = await requireProjectAccess(deps.postgres.db, projectId, session.user.id);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const input = traceReviewInputSchema.safeParse(await safeJson(c));
      if (!input.success) return apiError(c, 400, "invalid_review", "Invalid trace review");
      const traceId = c.req.param("traceId");
      const trace = await getTraceSummary(deps.clickhouse, projectId, traceId);
      if (trace === undefined) return apiError(c, 404, "not_found", "Trace not found");
      const result = traceReviewResult({
        projectId,
        trace,
        expiresAt: await getTraceExpiration(deps.clickhouse, projectId, traceId),
        input: input.data,
        reviewer: { id: session.user.id, name: session.user.name },
      });
      await insertEvaluations(deps.clickhouse, [result]);
      await recordHumanReviewAlert(deps.postgres, trace, result).catch((error: unknown) =>
        deps.logger.warn({ err: error, projectId, traceId }, "failed to record review alert"),
      );
      return c.json(result);
    });

export function cachedJson(c: Context<AppEnv>, body: string): Response {
  const tag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  c.header("Cache-Control", "private, no-cache");
  c.header("ETag", tag);
  const requestedTags = c.req
    .header("If-None-Match")
    ?.split(",")
    .map((value) => value.trim().replace(/^W\//, ""));
  if (requestedTags?.includes(tag) || requestedTags?.includes("*")) return c.body(null, 304);
  return c.body(body, 200, { "Content-Type": "application/json; charset=UTF-8" });
}
