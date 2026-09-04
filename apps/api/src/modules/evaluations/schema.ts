import {
  type EvaluationFilters,
  type EvaluationSortField,
  evaluationOutcomes,
  evaluationSortFields,
  evaluationSources,
  metricsRangeSchema,
} from "@lens/contracts";
import { z } from "zod";
import {
  clippedText,
  firstValue,
  fromBeforeTo,
  isoDate,
  orderField,
  pageField,
  pageSizeField,
  sortField,
  stripUndefined,
  valueList,
} from "../../utils/query-schema.js";

export type EvaluationRequest = {
  filters: EvaluationFilters;
  page: number;
  pageSize: number;
  sort: EvaluationSortField;
  order: "asc" | "desc";
};

export const evaluationQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    suite: valueList("suite"),
    metric: valueList("metric"),
    outcome: valueList("outcome", {
      allowed: evaluationOutcomes,
      allowedMessage: "outcome must be pass, fail, invalid, or unknown",
    }),
    environment: valueList("environment"),
    release: valueList("release"),
    source: valueList("source", {
      allowed: evaluationSources,
      allowedMessage: "source must be telemetry, human, or end_user",
    }),
    traceId: clippedText("traceId"),
    search: clippedText("search"),
    page: pageField("page must be positive"),
    pageSize: pageSizeField(50),
    sort: sortField(evaluationSortFields, "timestamp", "Unsupported evaluation sort field"),
    order: orderField(),
  })
  .superRefine(fromBeforeTo)
  .transform(
    (value): EvaluationRequest => ({
      filters: stripUndefined({
        from: value.from,
        to: value.to,
        suites: value.suite,
        metrics: value.metric,
        outcomes: value.outcome,
        environments: value.environment,
        releases: value.release,
        sources: value.source,
        traceId: value.traceId,
        search: value.search,
      }),
      page: value.page,
      pageSize: value.pageSize,
      sort: value.sort,
      order: value.order,
    }),
  );

export const evaluationOverviewQuerySchema = z
  .object({
    // Declared first so an invalid range is reported before filter issues,
    // matching the previous range-then-filters check order.
    range: firstValue(metricsRangeSchema.default("24h")),
    from: isoDate("from"),
    to: isoDate("to"),
    suite: valueList("suite"),
    metric: valueList("metric"),
    outcome: valueList("outcome", {
      allowed: evaluationOutcomes,
      allowedMessage: "outcome must be pass, fail, invalid, or unknown",
    }),
    environment: valueList("environment"),
    release: valueList("release"),
    source: valueList("source", {
      allowed: evaluationSources,
      allowedMessage: "source must be telemetry, human, or end_user",
    }),
    traceId: clippedText("traceId"),
    search: clippedText("search"),
  })
  .superRefine(fromBeforeTo)
  .transform((value) =>
    stripUndefined({
      range: value.range,
      suites: value.suite,
      metrics: value.metric,
      outcomes: value.outcome,
      environments: value.environment,
      releases: value.release,
      sources: value.source,
      traceId: value.traceId,
      search: value.search,
      // from/to stay preset-controlled: queryEvaluationOverview derives them
      // from the range.
    }),
  );
