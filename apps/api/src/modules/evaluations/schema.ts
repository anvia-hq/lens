import {
  type EvaluationFilters,
  type EvaluationSortField,
  evaluationOutcomes,
  evaluationSortFields,
} from "@lens/contracts";
import type { Context } from "hono";

export function parseEvaluationRequest(c: Context):
  | {
      filters: EvaluationFilters;
      page: number;
      pageSize: number;
      sort: EvaluationSortField;
      order: "asc" | "desc";
    }
  | string {
  const filters: EvaluationFilters = {};
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
    ["suite", "suites"],
    ["metric", "metrics"],
    ["outcome", "outcomes"],
    ["environment", "environments"],
    ["release", "releases"],
  ] as const) {
    const values = (c.req.queries(queryKey) ?? []).map((value) => value.trim()).filter(Boolean);
    if (values.length > 50) return `${queryKey} accepts at most 50 values`;
    if (
      queryKey === "outcome" &&
      values.some((value) => !evaluationOutcomes.includes(value as never))
    ) {
      return "outcome must be pass, fail, invalid, or unknown";
    }
    if (values.length > 0) Object.assign(filters, { [field]: Array.from(new Set(values)) });
  }
  for (const key of ["traceId", "search"] as const) {
    const value = c.req.query(key)?.trim();
    if (value === undefined || value.length === 0) continue;
    if (value.length > 256) return `${key} must be at most 256 characters`;
    filters[key] = value;
  }
  const page = Number(c.req.query("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) return "page must be positive";
  const pageSize = Number(c.req.query("pageSize") ?? 50);
  if (![25, 50, 100].includes(pageSize)) return "pageSize must be 25, 50, or 100";
  const rawSort = c.req.query("sort") ?? "timestamp";
  if (!evaluationSortFields.includes(rawSort as EvaluationSortField)) {
    return "Unsupported evaluation sort field";
  }
  const rawOrder = c.req.query("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") return "order must be asc or desc";
  return {
    filters,
    page,
    pageSize,
    sort: rawSort as EvaluationSortField,
    order: rawOrder,
  };
}
