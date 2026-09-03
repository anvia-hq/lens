import { type TraceFilters, type TraceSortField, traceSortFields } from "@lens/contracts";
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
  trimmedEnum,
  valueList,
} from "../../utils/query-schema.js";

export type TraceRequest = {
  filters: TraceFilters;
  page: number;
  pageSize: number;
  sort: TraceSortField;
  order: "asc" | "desc";
};

export const traceQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    status: valueList("status", {
      allowed: ["running", "ok", "error", "unset"],
      allowedMessage: "status must be running, ok, error, or unset",
    }),
    service: valueList("service"),
    name: valueList("name"),
    model: valueList("model"),
    environment: valueList("environment"),
    release: valueList("release"),
    version: valueList("version"),
    serviceVersion: valueList("serviceVersion"),
    tag: valueList("tag"),
    userId: clippedText("userId"),
    exactUserId: clippedText("exactUserId"),
    sessionId: clippedText("sessionId"),
    traceId: clippedText("traceId"),
    search: clippedText("search"),
    review: trimmedEnum(["unreviewed", "pass", "fail"], "review must be unreviewed, pass, or fail"),
    minDurationMs: nonNegativeNumber("minDurationMs"),
    maxDurationMs: nonNegativeNumber("maxDurationMs"),
    minTotalTokens: nonNegativeNumber("minTotalTokens"),
    maxTotalTokens: nonNegativeNumber("maxTotalTokens"),
    minTotalCost: nonNegativeNumber("minTotalCost"),
    maxTotalCost: nonNegativeNumber("maxTotalCost"),
    page: pageField("page must be a positive integer"),
    pageSize: pageSizeField(50),
    sort: sortField(traceSortFields, "startedAt", "Unsupported trace sort field"),
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
    (value): TraceRequest => ({
      filters: stripUndefined({
        from: value.from,
        to: value.to,
        statuses: value.status,
        services: value.service,
        names: value.name,
        models: value.model,
        environments: value.environment,
        releases: value.release,
        versions: value.version,
        serviceVersions: value.serviceVersion,
        tags: value.tag,
        userId: value.userId,
        exactUserId: value.exactUserId,
        sessionId: value.sessionId,
        traceId: value.traceId,
        search: value.search,
        review: value.review,
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
