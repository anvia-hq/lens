import type { EvaluationRunFilters, EvaluationRunSortField } from "@lens/contracts";
import { z } from "zod";
import {
  clippedText,
  isoDate,
  orderField,
  pageField,
  pageSizeField,
  sortField,
  stripUndefined,
  valueList,
} from "../../utils/query-schema.js";

export type RunRequest = EvaluationRunFilters & {
  page: number;
  pageSize: number;
  sort: EvaluationRunSortField;
  order: "asc" | "desc";
};

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

export const runQuerySchema = z
  .object({
    from: isoDate("from"),
    to: isoDate("to"),
    suite: valueList("suite"),
    status: valueList("status", {
      allowed: evaluationRunStatuses,
      allowedMessage: "status must be running, completed, or failed",
    }),
    environment: valueList("environment"),
    release: valueList("release"),
    search: clippedText("search"),
    page: pageField("page must be positive"),
    pageSize: pageSizeField(25),
    sort: sortField(evaluationRunSortFields, "startedAt", "Unsupported evaluation run sort field"),
    order: orderField(),
  })
  .transform(
    (value): RunRequest => ({
      ...stripUndefined({
        from: value.from,
        to: value.to,
        suites: value.suite,
        statuses: value.status,
        environments: value.environment,
        releases: value.release,
        search: value.search,
      }),
      page: value.page,
      pageSize: value.pageSize,
      sort: value.sort,
      order: value.order,
    }),
  );
