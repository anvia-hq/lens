import type { EvaluationRunFilters, EvaluationRunSortField } from "@lens/contracts";
import type { Context } from "hono";

const evaluationRunStatuses = ["running", "completed", "failed"] as const;
const evaluationRunSortFields = [
  "startedAt",
  "suiteName",
  "status",
  "release",
  "environment",
  "evaluatedCases",
  "results",
  "passRate",
  "durationMs",
  "p95LatencyMs",
  "averageTotalTokens",
  "traceCoverage",
] as const satisfies readonly EvaluationRunSortField[];

export function parseRunRequest(c: Context):
  | (EvaluationRunFilters & {
      page: number;
      pageSize: number;
      sort: EvaluationRunSortField;
      order: "asc" | "desc";
    })
  | string {
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
  const rawSort = c.req.query("sort") ?? "startedAt";
  if (!evaluationRunSortFields.includes(rawSort as EvaluationRunSortField)) {
    return "Unsupported evaluation run sort field";
  }
  const rawOrder = c.req.query("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") return "order must be asc or desc";
  return {
    ...filters,
    page,
    pageSize,
    sort: rawSort as EvaluationRunSortField,
    order: rawOrder,
  };
}
