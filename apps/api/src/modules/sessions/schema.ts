import {
  decodeCursor,
  type SessionFilters,
  type SessionSortField,
  sessionSortFields,
} from "@lens/contracts";
import { z } from "zod";
import {
  clippedText,
  fromBeforeTo,
  isoDate,
  nonNegativeNumber,
  orderedPairs,
  orderField,
  pageField,
  pageSizeField,
  sortField,
  stripUndefined,
  valueList,
} from "../../utils/query-schema.js";

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

export const sessionQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    status: valueList("status", {
      allowed: ["running", "success", "error"],
      allowedMessage: "status must be running, success, or error",
    }),
    user: valueList("user"),
    service: valueList("service"),
    model: valueList("model"),
    environment: valueList("environment"),
    tag: valueList("tag"),
    search: clippedText("search"),
    minDurationMs: nonNegativeNumber("minDurationMs"),
    maxDurationMs: nonNegativeNumber("maxDurationMs"),
    minTotalTokens: nonNegativeNumber("minTotalTokens"),
    maxTotalTokens: nonNegativeNumber("maxTotalTokens"),
    minTotalCost: nonNegativeNumber("minTotalCost"),
    maxTotalCost: nonNegativeNumber("maxTotalCost"),
    page: pageField("page must be a positive integer"),
    pageSize: pageSizeField(50),
    sort: sortField(sessionSortFields, "startedAt", "Unsupported session sort field"),
    order: orderField(),
  })
  .superRefine(fromBeforeTo)
  .superRefine(
    orderedPairs([
      ["minDurationMs", "maxDurationMs"],
      ["minTotalTokens", "maxTotalTokens"],
      ["minTotalCost", "maxTotalCost"],
    ]),
  )
  .transform(
    (value): SessionRequest => ({
      ...stripUndefined({
        from: value.from,
        to: value.to,
        statuses: value.status,
        users: value.user,
        services: value.service,
        models: value.model,
        environments: value.environment,
        tags: value.tag,
        search: value.search,
        minDurationMs: value.minDurationMs,
        maxDurationMs: value.maxDurationMs,
        minTotalTokens: value.minTotalTokens,
        maxTotalTokens: value.maxTotalTokens,
        minTotalCost: value.minTotalCost,
        maxTotalCost: value.maxTotalCost,
      }),
      page: value.page,
      pageSize: value.pageSize,
      sort: value.sort,
      order: value.order,
    }),
  );

export const sessionDetailQuerySchema = z
  .object({
    pageSize: pageSizeField(100),
    cursor: z.preprocess(
      (value) => {
        const raw = Array.isArray(value) ? value[0] : value;
        const text = typeof raw === "string" ? raw.trim() : undefined;
        return text === undefined || text.length === 0 ? undefined : text;
      },
      z
        .string()
        .max(1_024, { message: "cursor is invalid" })
        .transform((value) => decodeCursor(value))
        .refine(
          (cursor): cursor is { startedAt: string; traceId: string } =>
            cursor !== undefined &&
            Number.isFinite(Date.parse(cursor.startedAt)) &&
            cursor.traceId.length > 0 &&
            cursor.traceId.length <= 256,
          { message: "cursor is invalid" },
        )
        .optional(),
    ),
  })
  .transform(
    (value): SessionDetailRequest =>
      stripUndefined({ pageSize: value.pageSize, cursor: value.cursor }),
  );
