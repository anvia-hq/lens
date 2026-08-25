import { Counter, Histogram, Registry } from "prom-client";

export function createApiMetrics() {
  const registry = new Registry();
  const accepted = new Counter({
    name: "lens_ingest_spans_accepted_total",
    help: "Accepted OTLP spans",
    registers: [registry],
  });
  const rejected = new Counter({
    name: "lens_ingest_spans_rejected_total",
    help: "Rejected OTLP requests or spans",
    labelNames: ["reason"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: "lens_ingest_duration_seconds",
    help: "OTLP request acceptance latency",
    registers: [registry],
  });
  const evaluationsAccepted = new Counter({
    name: "lens_ingest_evaluations_accepted_total",
    help: "Accepted OTLP evaluation results",
    registers: [registry],
  });
  const evaluationLogsRejected = new Counter({
    name: "lens_ingest_evaluation_logs_rejected_total",
    help: "Rejected OTLP evaluation log requests or records",
    labelNames: ["reason"],
    registers: [registry],
  });
  const mcpHttpRequests = new Counter({
    name: "lens_mcp_http_requests_total",
    help: "MCP HTTP requests",
    labelNames: ["status"],
    registers: [registry],
  });
  const mcpToolCalls = new Counter({
    name: "lens_mcp_tool_calls_total",
    help: "MCP tool calls",
    labelNames: ["tool", "outcome"],
    registers: [registry],
  });
  const mcpToolDuration = new Histogram({
    name: "lens_mcp_tool_duration_seconds",
    help: "MCP tool execution latency",
    labelNames: ["tool"],
    registers: [registry],
  });
  return {
    registry,
    accepted,
    rejected,
    duration,
    evaluationsAccepted,
    evaluationLogsRejected,
    mcpHttpRequests,
    mcpToolCalls,
    mcpToolDuration,
  };
}

export type ApiMetrics = ReturnType<typeof createApiMetrics>;
