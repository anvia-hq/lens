import {
  decodeCursor,
  type SessionFilters,
  type SessionSortField,
  sessionSortFields,
} from "@lens/contracts";
import type { Context } from "hono";

export type SessionRequest = SessionFilters & {
  page: number;
  pageSize: number;
  sort: SessionSortField;
  order: "asc" | "desc";
};

export type SessionDetailRequest = {
  pageSize: 25 | 50 | 100;
  cursor?: { startedAt: string; traceId: string };
};

export function parseSessionDetailRequest(c: Context): SessionDetailRequest | string {
  const pageSize = Number(c.req.query("pageSize") ?? 100);
  if (pageSize !== 25 && pageSize !== 50 && pageSize !== 100) {
    return "pageSize must be 25, 50, or 100";
  }
  const rawCursor = c.req.query("cursor")?.trim();
  if (rawCursor === undefined || rawCursor.length === 0) return { pageSize };
  if (rawCursor.length > 1_024) return "cursor is invalid";
  const cursor = decodeCursor(rawCursor);
  if (
    cursor === undefined ||
    !Number.isFinite(Date.parse(cursor.startedAt)) ||
    cursor.traceId.length === 0 ||
    cursor.traceId.length > 256
  ) {
    return "cursor is invalid";
  }
  return { pageSize, cursor };
}

export function parseSessionRequest(c: Context): SessionRequest | string {
  const filters: SessionFilters = {};
  for (const key of ["from", "to"] as const) {
    const value = c.req.query(key);
    if (value === undefined || value.length === 0) continue;
    if (!Number.isFinite(Date.parse(value))) return `${key} must be an ISO date`;
    filters[key] = value;
  }
  if (
    filters.from !== undefined &&
    filters.to !== undefined &&
    Date.parse(filters.from) > Date.parse(filters.to)
  ) {
    return "from must not be after to";
  }
  for (const [queryKey, field] of [
    ["status", "statuses"],
    ["user", "users"],
    ["service", "services"],
    ["model", "models"],
    ["environment", "environments"],
    ["tag", "tags"],
  ] as const) {
    const values = (c.req.queries(queryKey) ?? []).map((value) => value.trim()).filter(Boolean);
    if (values.length > 50) return `${queryKey} accepts at most 50 values`;
    if (
      queryKey === "status" &&
      values.some((value) => value !== "running" && value !== "success" && value !== "error")
    ) {
      return "status must be running, success, or error";
    }
    if (values.length > 0) Object.assign(filters, { [field]: Array.from(new Set(values)) });
  }
  const search = c.req.query("search")?.trim();
  if (search !== undefined && search.length > 0) {
    if (search.length > 256) return "search must be at most 256 characters";
    filters.search = search;
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
  if (!sessionSortFields.includes(rawSort as SessionSortField)) {
    return "Unsupported session sort field";
  }
  const rawOrder = c.req.query("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") return "order must be asc or desc";
  return {
    ...filters,
    page,
    pageSize,
    sort: rawSort as SessionSortField,
    order: rawOrder,
  };
}
