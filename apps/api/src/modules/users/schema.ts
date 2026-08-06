import { type UserFilters, type UserSortField, userSortFields } from "@lens/contracts";
import type { Context } from "hono";

export type UserRequest = UserFilters & {
  page: number;
  pageSize: number;
  sort: UserSortField;
  order: "asc" | "desc";
};

export function parseUserRequest(c: Context): UserRequest | string {
  const parsed = parseUserFilters(c);
  if (typeof parsed === "string") return parsed;
  const page = Number(c.req.query("page") ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    return "page must be a positive integer";
  }
  const pageSize = Number(c.req.query("pageSize") ?? 50);
  if (![25, 50, 100].includes(pageSize)) return "pageSize must be 25, 50, or 100";
  const rawSort = c.req.query("sort") ?? "lastSeenAt";
  if (!userSortFields.includes(rawSort as UserSortField)) return "Unsupported user sort field";
  const rawOrder = c.req.query("order") ?? "desc";
  if (rawOrder !== "asc" && rawOrder !== "desc") return "order must be asc or desc";
  return {
    ...parsed,
    page,
    pageSize,
    sort: rawSort as UserSortField,
    order: rawOrder,
  };
}

export function parseUserFilters(c: Context): UserFilters | string {
  const filters: UserFilters = {};
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
  const search = c.req.query("search")?.trim();
  if (search !== undefined && search.length > 0) {
    if (search.length > 256) return "search must be at most 256 characters";
    filters.search = search;
  }
  return filters;
}
