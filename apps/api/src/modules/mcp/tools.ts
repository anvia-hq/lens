import { decodeCursor } from "@lens/contracts";
import {
  getSession,
  getSpan,
  getTrace,
  listAlertIncidents,
  listSessions,
  listTraces,
  queryMetrics,
} from "@lens/db";
import { McpServer } from "@modelcontextprotocol/server";
import type { ApiMetrics } from "../../utils/metrics.js";
import type { ApiDependencies } from "../../utils/types.js";
import { loadAlertIncidentDetail } from "../alerts/services.js";
import { jsonValue, PayloadBudget } from "./payload.js";
import {
  getAlertInputSchema,
  getSessionInputSchema,
  getSpanInputSchema,
  getTraceInputSchema,
  listAlertsInputSchema,
  overviewInputSchema,
  searchSessionsInputSchema,
  searchTracesInputSchema,
  toolOutputSchema,
} from "./schemas.js";

const MAX_TRACE_SPANS = 500;
const MAX_TRACE_EVALUATIONS = 100;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1_000;

export type McpPrincipal = {
  tokenId: string;
  allowRawPayloads: boolean;
  project: { id: string; name: string; slug: string };
};

export function createLensMcpServer(
  deps: ApiDependencies,
  metrics: ApiMetrics,
  principal: McpPrincipal,
): McpServer {
  const server = new McpServer({ name: "anvia-lens", version: "1.0.0" });
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  server.registerTool(
    "get_overview",
    {
      title: "Get observability overview",
      description:
        "Summarize current and previous trace, error, latency, token, cost, model, service, and tool metrics for this Lens project.",
      inputSchema: overviewInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "get_overview", async () => {
        const input = overviewInputSchema.parse(raw);
        return success(
          principal,
          projectUrl(deps, principal, ""),
          await queryMetrics(deps.clickhouse, principal.project.id, input.range),
        );
      }),
  );

  server.registerTool(
    "search_traces",
    {
      title: "Search traces",
      description:
        "Find trace summaries by time, status, service, model, environment, release, user, session, review, duration, token, cost, or text filters.",
      inputSchema: searchTracesInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "search_traces", async () => {
        const input = searchTracesInputSchema.parse(raw);
        const range = normalizeRange(input.from, input.to);
        validateBounds(input);
        const page = await listTraces(deps.clickhouse, principal.project.id, {
          ...input,
          ...range,
        });
        return success(principal, projectUrl(deps, principal, "/traces"), page);
      }),
  );

  server.registerTool(
    "get_trace",
    {
      title: "Get trace",
      description:
        "Inspect a trace summary, its span tree, and evaluations. Set includePayload to request evaluation payloads and metadata; use get_span for raw span data.",
      inputSchema: getTraceInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "get_trace", async () => {
        const input = getTraceInputSchema.parse(raw);
        authorizePayload(principal, input.includePayload);
        const trace = await getTrace(deps.clickhouse, principal.project.id, input.traceId, {
          spanLimit: MAX_TRACE_SPANS,
          includeEvaluationPayloads: input.includePayload,
        });
        if (trace === undefined) throw new ToolError("not_found", "Trace not found");
        const budget = new PayloadBudget();
        const spans = trace.spans.slice(0, MAX_TRACE_SPANS);
        const evaluations = trace.evaluations.slice(0, MAX_TRACE_EVALUATIONS).map((evaluation) => {
          const { metadata, payload, ...summary } = evaluation;
          return input.includePayload
            ? {
                ...summary,
                metadata: budget.include(metadata),
                payload: budget.include(payload ?? null),
              }
            : {
                ...summary,
                metadata: {},
                payload: null,
                payloadOmitted: true,
              };
        });
        return success(
          principal,
          projectUrl(deps, principal, `/traces/${encodeURIComponent(input.traceId)}`),
          {
            summary: trace.summary,
            spans,
            spansOmitted: Math.max(0, trace.summary.spanCount - spans.length),
            evaluations,
            evaluationsOmitted: trace.evaluations.length - evaluations.length,
            payloadIncluded: input.includePayload,
          },
        );
      }),
  );

  server.registerTool(
    "get_span",
    {
      title: "Get span",
      description:
        "Inspect one span. Set includePayload to request attributes, events, links, input, and output when the token permits raw payload access.",
      inputSchema: getSpanInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "get_span", async () => {
        const input = getSpanInputSchema.parse(raw);
        authorizePayload(principal, input.includePayload);
        const span = await getSpan(
          deps.clickhouse,
          principal.project.id,
          input.traceId,
          input.spanId,
          { includePayloads: input.includePayload },
        );
        if (span === undefined) throw new ToolError("not_found", "Span not found");
        const {
          resourceAttributes,
          spanAttributes,
          events,
          links,
          input: spanInput,
          output,
          ...operational
        } = span;
        const budget = new PayloadBudget();
        const payload = input.includePayload
          ? {
              resourceAttributes: budget.include(resourceAttributes),
              spanAttributes: budget.include(spanAttributes),
              events: budget.include(events),
              links: budget.include(links),
              input: budget.include(spanInput ?? null),
              output: budget.include(output ?? null),
            }
          : undefined;
        return success(
          principal,
          projectUrl(
            deps,
            principal,
            `/traces/${encodeURIComponent(input.traceId)}?span=${encodeURIComponent(input.spanId)}`,
          ),
          {
            ...operational,
            payloadIncluded: input.includePayload,
            ...(payload ? { payload } : {}),
          },
        );
      }),
  );

  server.registerTool(
    "search_sessions",
    {
      title: "Search sessions",
      description:
        "Find session summaries by time, status, user, service, model, environment, tag, duration, token, cost, or text filters.",
      inputSchema: searchSessionsInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "search_sessions", async () => {
        const input = searchSessionsInputSchema.parse(raw);
        const range = normalizeRange(input.from, input.to);
        validateBounds(input);
        const page = await listSessions(deps.clickhouse, principal.project.id, {
          ...input,
          ...range,
        });
        return success(principal, projectUrl(deps, principal, "/sessions"), page);
      }),
  );

  server.registerTool(
    "get_session",
    {
      title: "Get session",
      description:
        "Inspect a session and its traces. Set includePayload to request conversational turns when the token permits raw payload access.",
      inputSchema: getSessionInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "get_session", async () => {
        const input = getSessionInputSchema.parse(raw);
        authorizePayload(principal, input.includePayload);
        const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
        if (input.cursor !== undefined && !validCursor(cursor)) {
          throw new ToolError("invalid_cursor", "Session cursor is invalid");
        }
        const session = await getSession(deps.clickhouse, principal.project.id, input.sessionId, {
          pageSize: input.pageSize,
          cursor,
          includeTurns: input.includePayload,
        });
        if (session === undefined) throw new ToolError("not_found", "Session not found");
        const budget = new PayloadBudget();
        const turns = input.includePayload
          ? session.turns.map((turn) => ({
              trace: turn.trace,
              prompt:
                turn.prompt === null
                  ? null
                  : { ...turn.prompt, value: budget.include(turn.prompt.value) },
              response:
                turn.response === null
                  ? null
                  : { ...turn.response, value: budget.include(turn.response.value) },
            }))
          : [];
        return success(
          principal,
          projectUrl(deps, principal, `/sessions/${encodeURIComponent(input.sessionId)}`),
          {
            ...session,
            turns,
            turnsOmitted: !input.includePayload,
            payloadIncluded: input.includePayload,
          },
        );
      }),
  );

  server.registerTool(
    "list_alerts",
    {
      title: "List alert incidents",
      description:
        "List active or resolved Lens alert incidents, optionally filtered by alert kind.",
      inputSchema: listAlertsInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "list_alerts", async () => {
        const input = listAlertsInputSchema.parse(raw);
        const page = await listAlertIncidents(deps.postgres.db, principal.project.id, input);
        return success(principal, projectUrl(deps, principal, "/alerts"), page);
      }),
  );

  server.registerTool(
    "get_alert",
    {
      title: "Get alert incident",
      description:
        "Inspect an alert incident, its signal, contributor analysis, and evidence traces.",
      inputSchema: getAlertInputSchema,
      outputSchema: toolOutputSchema,
      annotations,
    },
    (raw) =>
      runTool(deps, metrics, principal, "get_alert", async () => {
        const input = getAlertInputSchema.parse(raw);
        const detail = await loadAlertIncidentDetail(deps, principal.project.id, input.incidentId);
        if (detail === undefined) throw new ToolError("not_found", "Alert incident not found");
        return success(
          principal,
          projectUrl(deps, principal, `/alerts/${encodeURIComponent(input.incidentId)}`),
          detail,
        );
      }),
  );

  return server;
}

async function runTool(
  deps: ApiDependencies,
  metrics: ApiMetrics,
  principal: McpPrincipal,
  name: string,
  callback: () => Promise<ReturnType<typeof success>>,
) {
  const startedAt = performance.now();
  let outcome = "success";
  try {
    return await callback();
  } catch (error) {
    outcome = error instanceof ToolError ? error.code : "internal_error";
    if (!(error instanceof ToolError)) {
      deps.logger.error(
        { err: error, projectId: principal.project.id, tokenId: principal.tokenId, tool: name },
        "MCP tool failed",
      );
    }
    const message = error instanceof ToolError ? error.message : "The Lens tool could not complete";
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: outcome, message }) }],
      isError: true,
    };
  } finally {
    const durationSeconds = (performance.now() - startedAt) / 1_000;
    metrics.mcpToolCalls.labels(name, outcome).inc();
    metrics.mcpToolDuration.labels(name).observe(durationSeconds);
    deps.logger.info(
      {
        projectId: principal.project.id,
        tokenId: principal.tokenId,
        tool: name,
        outcome,
        durationMs: Math.round(durationSeconds * 100_000) / 100,
      },
      "MCP tool completed",
    );
  }
}

function success(principal: McpPrincipal, webUrl: string | null, data: unknown) {
  const output = {
    project: principal.project,
    webUrl,
    data: jsonValue(data),
  };
  const text = JSON.stringify(output);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES) {
    throw new ToolError(
      "result_too_large",
      "The result exceeds the MCP response limit; narrow the search or request a specific span",
    );
  }
  return { content: [{ type: "text" as const, text }], structuredContent: output };
}

function authorizePayload(principal: McpPrincipal, requested: boolean): void {
  if (requested && !principal.allowRawPayloads) {
    throw new ToolError(
      "payload_access_denied",
      "This MCP token does not permit raw payload access; an administrator must enable it on a new token",
    );
  }
}

function normalizeRange(from: string | undefined, to: string | undefined) {
  const end = to === undefined ? new Date() : new Date(to);
  const start = from === undefined ? new Date(end.getTime() - DEFAULT_RANGE_MS) : new Date(from);
  if (start.getTime() > end.getTime()) {
    throw new ToolError("invalid_range", "from must not be after to");
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    throw new ToolError("invalid_range", "MCP searches are limited to a 90-day interval");
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

function validateBounds(input: Record<string, unknown>): void {
  for (const [minimum, maximum] of [
    ["minDurationMs", "maxDurationMs"],
    ["minTotalTokens", "maxTotalTokens"],
    ["minTotalCost", "maxTotalCost"],
  ] as const) {
    const min = input[minimum];
    const max = input[maximum];
    if (typeof min === "number" && typeof max === "number" && min > max) {
      throw new ToolError("invalid_range", `${minimum} must not exceed ${maximum}`);
    }
  }
}

function validCursor(
  cursor: { startedAt: string; traceId: string } | undefined,
): cursor is { startedAt: string; traceId: string } {
  return (
    cursor !== undefined &&
    Number.isFinite(Date.parse(cursor.startedAt)) &&
    cursor.traceId.length > 0 &&
    cursor.traceId.length <= 256
  );
}

function projectUrl(deps: ApiDependencies, principal: McpPrincipal, suffix: string): string {
  return new URL(`/${principal.project.id}${suffix}`, deps.config.PUBLIC_APP_URL).toString();
}

class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
