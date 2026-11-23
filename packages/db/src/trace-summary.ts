import type { TraceStatus, TraceSummary } from "@lens/contracts";
import { extractPayloadPreview } from "./payload-preview.js";
import { ensureIso, nullableNumeric, numeric } from "./values.js";

export type SummaryRow = {
  project_id: string;
  trace_id: string;
  name: string;
  service_name: string;
  status: TraceStatus;
  started_at: string;
  ended_at: string;
  duration_ms: number | string;
  span_count: number | string;
  generation_count: number | string;
  tool_count: number | string;
  error_count: number | string;
  user_id: string | null;
  session_id: string | null;
  tags: string[];
  model: string | null;
  input_preview?: string | null;
  output_preview?: string | null;
  environment: string;
  release: string | null;
  version: string | null;
  service_version: string | null;
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  input_cost: number | string | null;
  output_cost: number | string | null;
  total_cost: number | string | null;
  last_seen_at: string;
};

export function summaryFromRow(row: SummaryRow): TraceSummary {
  return {
    projectId: row.project_id,
    traceId: row.trace_id,
    name: row.name,
    serviceName: row.service_name,
    status: row.status,
    startedAt: ensureIso(row.started_at),
    endedAt: ensureIso(row.ended_at),
    durationMs: numeric(row.duration_ms),
    spanCount: numeric(row.span_count),
    generationCount: numeric(row.generation_count),
    toolCount: numeric(row.tool_count),
    errorCount: numeric(row.error_count),
    userId: row.user_id,
    sessionId: row.session_id,
    tags: row.tags,
    model: row.model,
    inputPreview: extractPayloadPreview(row.input_preview, "input", 240),
    outputPreview: extractPayloadPreview(row.output_preview, "output", 240),
    environment: row.environment || "default",
    release: row.release,
    version: row.version,
    serviceVersion: row.service_version,
    inputTokens: numeric(row.input_tokens),
    outputTokens: numeric(row.output_tokens),
    totalTokens: numeric(row.total_tokens),
    inputCost: nullableNumeric(row.input_cost),
    outputCost: nullableNumeric(row.output_cost),
    totalCost: nullableNumeric(row.total_cost),
    lastSeenAt: ensureIso(row.last_seen_at),
  };
}

export function clickHouseToNano(value: string): string {
  const normalized = value.replace(" ", "T");
  const [whole = normalized, fraction = "0"] = normalized.split(".");
  const seconds = BigInt(Math.floor(Date.parse(`${whole}Z`) / 1_000));
  return (seconds * 1_000_000_000n + BigInt(fraction.padEnd(9, "0").slice(0, 9))).toString();
}
