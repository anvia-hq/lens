import { type UserFilters, type UserSortField, userSortFields } from "@lens/contracts";
import { z } from "zod";
import {
  clippedText,
  fromBeforeTo,
  isoDate,
  orderField,
  pageField,
  pageSizeField,
  sortField,
  stripUndefined,
} from "../../utils/query-schema.js";

export type UserRequest = UserFilters & {
  page: number;
  pageSize: number;
  sort: UserSortField;
  order: "asc" | "desc";
};

export const userFiltersSchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    search: clippedText("search"),
  })
  .superRefine(fromBeforeTo)
  .transform(
    (value): UserFilters =>
      stripUndefined({ from: value.from, to: value.to, search: value.search }),
  );

export const userQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    search: clippedText("search"),
    page: pageField("page must be a positive integer"),
    pageSize: pageSizeField(50),
    sort: sortField(userSortFields, "lastSeenAt", "Unsupported user sort field"),
    order: orderField(),
  })
  .superRefine(fromBeforeTo)
  .transform(
    (value): UserRequest => ({
      ...stripUndefined({ from: value.from, to: value.to, search: value.search }),
      page: value.page,
      pageSize: value.pageSize,
      sort: value.sort,
      order: value.order,
    }),
  );
