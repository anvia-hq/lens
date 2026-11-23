import {
  observationKinds,
  type RunFilters,
  type RunSortField,
  runSortFields,
  spanStatuses,
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

export type RunRequest = {
  filters: RunFilters;
  page: number;
  pageSize: number;
  sort: RunSortField;
  order: "asc" | "desc";
};

export const runQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    observationKind: valueList("observationKind", {
      allowed: observationKinds,
      allowedMessage: `observationKind must be one of ${observationKinds.join(", ")}`,
    }),
    status: valueList("status", {
      allowed: spanStatuses,
      allowedMessage: "status must be unset, ok, or error",
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
    sessionId: clippedText("sessionId"),
    traceId: clippedText("traceId"),
    search: clippedText("search"),
    minDurationMs: nonNegativeNumber("minDurationMs"),
    maxDurationMs: nonNegativeNumber("maxDurationMs"),
    minTotalTokens: nonNegativeNumber("minTotalTokens"),
    maxTotalTokens: nonNegativeNumber("maxTotalTokens"),
    minTotalCost: nonNegativeNumber("minTotalCost"),
    maxTotalCost: nonNegativeNumber("maxTotalCost"),
    page: pageField("page must be a positive integer"),
    pageSize: pageSizeField(50),
    sort: sortField(runSortFields, "startedAt", "Unsupported run sort field"),
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
  .transform((value): RunRequest => ({
    filters: stripUndefined({
      from: value.from,
      to: value.to,
      observationKinds: value.observationKind,
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
      sessionId: value.sessionId,
      traceId: value.traceId,
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
  }));
