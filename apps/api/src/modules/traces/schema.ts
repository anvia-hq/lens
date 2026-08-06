import { type TraceFilters, type TraceSortField, traceSortFields } from "@lens/contracts";
import type { Context } from "hono";

export type TraceRequest = {
  filters: TraceFilters;
  page: number;
  pageSize: number;
  sort: TraceSortField;
  order: "asc" | "desc";
};

export function parseTraceRequest(c: Context): TraceRequest | string {
  const filters: TraceFilters = {};
  for (const key of ["from", "to"] as const) {
    const value = c.req.query(key);
    if (value === undefined || value.length === 0) continue;
    if (!Number.isFinite(Date.parse(value))) return `${key} must be an ISO date`;
    filters[key] = value;
  }
  if (filters.from !== undefined && filters.to !== undefined) {
    if (Date.parse(filters.from) > Date.parse(filters.to)) return "from must not be after to";
  }

  for (const [queryKey, field] of [
    ["status", "statuses"],
    ["service", "services"],
    ["name", "names"],
    ["model", "models"],
    ["environment", "environments"],
    ["release", "releases"],
    ["version", "versions"],
    ["serviceVersion", "serviceVersions"],
    ["tag", "tags"],
  ] as const) {
    const values = (c.req.queries(queryKey) ?? []).map((value) => value.trim()).filter(Boolean);
    if (values.length > 50) return `${queryKey} accepts at most 50 values`;
    if (
      queryKey === "status" &&
      values.some((value) => !["ok", "error", "unset"].includes(value))
    ) {
      return "status must be ok, error, or unset";
    }
    if (values.length > 0) Object.assign(filters, { [field]: Array.from(new Set(values)) });
  }

  for (const key of ["userId", "sessionId", "traceId", "search"] as const) {
    const value = c.req.query(key)?.trim();
    if (value === undefined || value.length === 0) continue;
    if (value.length > 256) return `${key} must be at most 256 characters`;
    filters[key] = value;
  }
  for (const key of [
    "minDurationMs",
    "maxDurationMs",
    "minTotalTokens",
    "maxTotalTokens",
    "minTotalCost",
    "maxTotalCost",
  ] as const) {
    const raw = c.req.query(key);
    if (raw === undefined || raw.length === 0) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return `${key} must be a non-negative number`;
    filters[key] = value;
  }
  for (const [minimum, maximum] of [
    ["minDurationMs", "maxDurationMs"],
    ["minTotalTokens", "maxTotalTokens"],
    ["minTotalCost", "maxTotalCost"],
  ] as const) {
    if (
      filters[minimum] !== undefined &&
      filters[maximum] !== undefined &&
      filters[minimum] > filters[maximum]
    ) {
      return `${minimum} must not exceed ${maximum}`;
    }
  }

  const page = Number(c.req.query("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    return "page must be a positive integer";
  }
  const pageSize = Number(c.req.query("pageSize") ?? 50);
  if (![25, 50, 100].includes(pageSize)) return "pageSize must be 25, 50, or 100";
  const rawSort = c.req.query("sort") ?? "startedAt";
  if (!traceSortFields.includes(rawSort as TraceSortField)) return "Unsupported trace sort field";
  const rawOrder = c.req.query("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") return "order must be asc or desc";
  return {
    filters,
    page,
    pageSize,
    sort: rawSort as TraceSortField,
    order: rawOrder,
  };
}
