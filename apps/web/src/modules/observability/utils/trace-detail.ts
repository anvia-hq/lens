import type {
  EvaluationResult,
  ManagedDatasetCaseInput,
  SpanDetail,
  TraceDetail,
} from "@lens/contracts";
import type { FlatSpanNode, SpanTreeNode, TracePayloadView } from "../types";

export type { FlatSpanNode, SpanTreeNode, TracePayloadView, TraceSpanView } from "../types";

type FormattedRow = {
  key: string;
  label: string;
  text: string;
  role?: string;
};

export const TRACE_LAYOUT_STORAGE_KEY = "lens-trace-detail-layout-v1";
export const TRACE_PAYLOAD_STORAGE_KEY = "lens-trace-payload-view";
export const NAVIGATION_PANEL_ID = "trace-navigation";
export const DETAIL_PANEL_ID = "trace-data";
export const TIMELINE_WIDTH = 720;

export function buildSpanForest(spans: SpanDetail[]): SpanTreeNode[] {
  const ordered = [...spans].sort(compareSpans);
  const nodes = new Map(ordered.map((span) => [span.spanId, span]));
  const children = new Map<string, SpanDetail[]>();
  const roots: SpanDetail[] = [];

  for (const span of ordered) {
    const parent = span.parentSpanId;
    if (parent === null || parent === span.spanId || !nodes.has(parent)) {
      roots.push(span);
      continue;
    }
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }

  const visited = new Set<string>();
  const build = (span: SpanDetail, ancestors: Set<string>): SpanTreeNode | null => {
    if (visited.has(span.spanId) || ancestors.has(span.spanId)) return null;
    visited.add(span.spanId);
    const nextAncestors = new Set(ancestors).add(span.spanId);
    return {
      span,
      children: (children.get(span.spanId) ?? [])
        .map((child) => build(child, nextAncestors))
        .filter((node): node is SpanTreeNode => node !== null),
    };
  };

  const forest = roots
    .map((span) => build(span, new Set()))
    .filter((node): node is SpanTreeNode => node !== null);
  for (const span of ordered) {
    if (visited.has(span.spanId)) continue;
    const recovered = build(span, new Set());
    if (recovered !== null) forest.push(recovered);
  }
  return forest;
}

export function traceReview(detail: TraceDetail): EvaluationResult | undefined {
  return detail.evaluations.find(
    (result) => result.source === "human" && result.metricName === "human-review",
  );
}

export function traceReviewDatasetCase(
  detail: TraceDetail,
  review: EvaluationResult,
): ManagedDatasetCaseInput | undefined {
  const root = buildSpanForest(detail.spans)[0]?.span;
  if (!root || root.input === null) return undefined;
  return {
    id: detail.summary.traceId,
    input: root.input,
    ...(root.output === null ? {} : { expected: root.output }),
    metadata: {
      sourceTraceId: detail.summary.traceId,
      reviewOutcome: review.outcome,
      reviewExplanation: review.explanation,
      reviewerId: review.reviewer?.id ?? null,
      reviewerName: review.reviewer?.name ?? null,
      reviewedAt: review.ingestedAt,
    },
  };
}

export function flattenSpanForest(
  roots: SpanTreeNode[],
  collapsed: ReadonlySet<string> = new Set(),
): FlatSpanNode[] {
  const rows: FlatSpanNode[] = [];
  const visit = (nodes: SpanTreeNode[], depth: number, ancestorContinues: boolean[]) => {
    nodes.forEach((node, index) => {
      const isLastSibling = index === nodes.length - 1;
      rows.push({
        span: node.span,
        depth,
        ancestorContinues,
        isLastSibling,
        hasChildren: node.children.length > 0,
      });
      if (!collapsed.has(node.span.spanId)) {
        visit(node.children, depth + 1, depth === 0 ? [] : [...ancestorContinues, !isLastSibling]);
      }
    });
  };
  visit(roots, 0, []);
  return rows;
}

export function searchTraceSpans(spans: SpanDetail[], query: string): SpanDetail[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [];
  return [...spans]
    .sort(compareSpans)
    .filter((span) =>
      [span.name, span.observationKind, span.serviceName, span.model, span.spanId]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(normalized)),
    );
}

export function traceTimelineBounds(detail: TraceDetail): { startMs: number; durationMs: number } {
  const starts = detail.spans.map(spanStartMs).filter(Number.isFinite);
  const ends = detail.spans.map(spanEndMs).filter(Number.isFinite);
  const summaryStart = Date.parse(detail.summary.startedAt);
  const summaryEnd = Date.parse(detail.summary.endedAt);
  if (Number.isFinite(summaryStart)) starts.push(summaryStart);
  if (Number.isFinite(summaryEnd)) ends.push(summaryEnd);
  const startMs = starts.length > 0 ? Math.min(...starts) : 0;
  const endMs = ends.length > 0 ? Math.max(...ends) : startMs;
  return { startMs, durationMs: Math.max(1, endMs - startMs) };
}

export function spanTimelinePosition(
  span: SpanDetail,
  bounds: { startMs: number; durationMs: number },
): { left: number; width: number } {
  const left = Math.max(0, Math.min(1, (spanStartMs(span) - bounds.startMs) / bounds.durationMs));
  const rawWidth = spanDurationMs(span) / bounds.durationMs;
  return {
    left: left * TIMELINE_WIDTH,
    width: Math.max(2, Math.min(TIMELINE_WIDTH - left * TIMELINE_WIDTH, rawWidth * TIMELINE_WIDTH)),
  };
}

export function rawTraceJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return String(value);
  }
}

export function jsonSyntaxTokens(json: string): Array<{
  text: string;
  type: "plain" | "key" | "string" | "number" | "boolean" | "null";
  start: number;
}> {
  const pattern =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/g;
  const tokens: Array<{
    text: string;
    type: "plain" | "key" | "string" | "number" | "boolean" | "null";
    start: number;
  }> = [];
  let cursor = 0;
  for (const match of json.matchAll(pattern)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: json.slice(cursor, index), type: "plain", start: cursor });
    }
    const following = json.slice(index + text.length).trimStart();
    const type = text.startsWith('"')
      ? following.startsWith(":")
        ? "key"
        : "string"
      : text === "true" || text === "false"
        ? "boolean"
        : text === "null"
          ? "null"
          : "number";
    tokens.push({ text, type, start: index });
    cursor = index + text.length;
  }
  if (cursor < json.length) {
    tokens.push({ text: json.slice(cursor), type: "plain", start: cursor });
  }
  return tokens;
}

export function formattedPayloadRows(title: string, value: unknown): FormattedRow[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") {
    return [{ key: `scalar:${title}`, label: title, text: String(value) }];
  }
  if (Array.isArray(value)) return formattedArrayRows(value, title);

  const record = value as Record<string, unknown>;
  const rows: FormattedRow[] = [];
  if (typeof record.instructions === "string" && record.instructions.trim().length > 0) {
    rows.push({
      key: "instructions",
      label: "System",
      role: "system",
      text: record.instructions,
    });
  }
  for (const key of ["messages", "chatHistory", "history", "prompt", "choice"] as const) {
    const nested = record[key];
    if (Array.isArray(nested)) rows.push(...formattedArrayRows(nested, labelText(key)));
  }
  if (rows.length > 0) return rows;

  return Object.entries(record).map(([key, item]) => ({
    key: `property:${key}`,
    label: labelText(key),
    role: messageRole(item),
    text: payloadText(item),
  }));
}

function formattedArrayRows(values: unknown[], parentLabel: string): FormattedRow[] {
  return values.map((item, index) => {
    const role = messageRole(item);
    const type = isRecord(item) && typeof item.type === "string" ? item.type : undefined;
    const label = role ?? (type === undefined ? `${parentLabel} ${index + 1}` : labelText(type));
    return {
      key: `${parentLabel}:${index}`,
      label: labelText(label),
      role,
      text: payloadText(item),
    };
  });
}

function messageRole(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.role === "string") return value.role.toLowerCase();
  if (value.type === "reasoning") return "reasoning";
  if (value.type === "tool_call" || value.type === "tool_result") return "tool";
  return undefined;
}

function payloadText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(payloadText).filter(Boolean).join("\n");
  if (isRecord(value)) {
    for (const key of ["text", "content", "message", "value", "result"] as const) {
      if (key in value) {
        const text = payloadText(value[key]);
        if (text.length > 0 && text !== "undefined") return text;
      }
    }
  }
  return rawTraceJson(value);
}

export function labelText(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareSpans(left: SpanDetail, right: SpanDetail): number {
  try {
    const difference = BigInt(left.startTimeUnixNano) - BigInt(right.startTimeUnixNano);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
  } catch {
    const difference = spanStartMs(left) - spanStartMs(right);
    if (difference !== 0) return difference;
  }
  return left.spanId.localeCompare(right.spanId);
}

export function nanoToMs(value: string): number {
  try {
    return Number(BigInt(value) / 1_000_000n);
  } catch {
    return 0;
  }
}

function spanStartMs(span: SpanDetail): number {
  return nanoToMs(span.startTimeUnixNano);
}

export function spanDurationMs(span: SpanDetail): number {
  return Math.max(0, nanoToMs(span.durationNano));
}

function spanEndMs(span: SpanDetail): number {
  const end = nanoToMs(span.endTimeUnixNano);
  return end > 0 ? end : spanStartMs(span) + spanDurationMs(span);
}

export function resolveSelectedSpan(
  spans: SpanDetail[],
  selectedSpanId?: string,
): SpanDetail | undefined {
  if (selectedSpanId !== undefined) {
    const selected = spans.find((span) => span.spanId === selectedSpanId);
    if (selected !== undefined) return selected;
  }
  const forest = buildSpanForest(spans);
  return forest[0]?.span ?? [...spans].sort(compareSpans)[0];
}

export function readStoredLayout(): Record<string, number> | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(TRACE_LAYOUT_STORAGE_KEY) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      typeof value[NAVIGATION_PANEL_ID] === "number" &&
      typeof value[DETAIL_PANEL_ID] === "number"
    ) {
      return {
        [NAVIGATION_PANEL_ID]: value[NAVIGATION_PANEL_ID],
        [DETAIL_PANEL_ID]: value[DETAIL_PANEL_ID],
      };
    }
  } catch {
    // Invalid or unavailable storage falls back to the default layout.
  }
  return undefined;
}

export function storedPayloadView(): TracePayloadView {
  try {
    return window.localStorage.getItem(TRACE_PAYLOAD_STORAGE_KEY) === "json" ? "json" : "formatted";
  } catch {
    return "formatted";
  }
}

export function toggleCollapsed(
  current: Set<string>,
  id: string,
  onChange: (value: Set<string>) => void,
) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  onChange(next);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
    value,
  );
}

export function formatDuration(value: number): string {
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}

export function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function formatNanoTimestamp(value: string): string {
  const date = new Date(nanoToMs(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
