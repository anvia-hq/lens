import type { EvaluationRunFilters } from "@lens/contracts";
import type { Context } from "hono";

const evaluationRunStatuses = ["running", "completed", "failed"] as const;

export function parseRunRequest(
  c: Context,
): (EvaluationRunFilters & { page: number; pageSize: number }) | string {
  const filters: EvaluationRunFilters = {};
  for (const key of ["from", "to"] as const) {
    const value = c.req.query(key);
    if (!value) continue;
    if (!Number.isFinite(Date.parse(value))) return `${key} must be an ISO date`;
    filters[key] = value;
  }
  for (const [queryKey, field] of [
    ["suite", "suites"],
    ["status", "statuses"],
    ["environment", "environments"],
    ["release", "releases"],
  ] as const) {
    const values = (c.req.queries(queryKey) ?? []).map((value) => value.trim()).filter(Boolean);
    if (values.length > 50) return `${queryKey} accepts at most 50 values`;
    if (
      queryKey === "status" &&
      values.some((value) => !evaluationRunStatuses.includes(value as never))
    ) {
      return "status must be running, completed, or failed";
    }
    if (values.length > 0) Object.assign(filters, { [field]: Array.from(new Set(values)) });
  }
  const search = c.req.query("search")?.trim();
  if (search) {
    if (search.length > 256) return "search must be at most 256 characters";
    filters.search = search;
  }
  const page = Number(c.req.query("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) return "page must be positive";
  const pageSize = Number(c.req.query("pageSize") ?? 25);
  if (![25, 50, 100].includes(pageSize)) return "pageSize must be 25, 50, or 100";
  return { ...filters, page, pageSize };
}
