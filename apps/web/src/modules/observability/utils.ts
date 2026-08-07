import type {
  EvaluationOutcome,
  EvaluationRunSortField,
  EvaluationSortField,
  MetricsRangePreset,
  SessionSortField,
  SessionStatus,
  SpanStatus,
  TraceSortField,
  UserSortField,
} from "@lens/contracts";
import {
  evaluationOutcomes,
  evaluationRunSortFields,
  evaluationSortFields,
  metricsRangePresets,
  sessionSortFields,
  traceSortFields,
  userSortFields,
} from "@lens/contracts";
import {
  defaultEvaluationResultColumns,
  defaultEvaluationRunColumns,
  defaultSessionColumns,
  defaultTraceColumns,
  defaultUserColumns,
  type EvaluationCompareSearch,
  type EvaluationDatasetsSearch,
  type EvaluationResultColumnId,
  type EvaluationResultsSearch,
  type EvaluationRunColumnId,
  type EvaluationRunDetailSearch,
  type EvaluationRunsSearch,
  evaluationResultColumnIds,
  evaluationRunColumnIds,
  type LegacyEvaluationsSearch,
  type OverviewSearch,
  type RefreshInterval,
  type ResolvedEvaluationResultsSearch,
  type ResolvedEvaluationRunsSearch,
  type ResolvedSessionsSearch,
  type ResolvedTracesSearch,
  type SessionColumnId,
  type SessionsSearch,
  sessionColumnIds,
  type TraceColumnId,
  type TraceCompareSearch,
  type TraceDetailSearch,
  type TracesSearch,
  traceColumnIds,
  type UserColumnId,
  type UserDetailSearch,
  type UserRange,
  type UsersSearch,
  userColumnIds,
} from "./types";

export function validateEvaluationRunDetailSearch(
  search: Record<string, unknown>,
): EvaluationRunDetailSearch {
  return { case: optionalSearchValue(search.case) };
}

export function validateEvaluationDatasetsSearch(
  search: Record<string, unknown>,
): EvaluationDatasetsSearch {
  return {
    dataset: optionalSearchValue(search.dataset),
    version: optionalSearchValue(search.version),
    search: optionalSearchValue(search.search),
    page: positiveInteger(search.page, 1),
  };
}

export function validateEvaluationsSearch(
  search: Record<string, unknown>,
): LegacyEvaluationsSearch {
  const rawOutcome = optionalSearchValue(search.outcome);
  const rawView = optionalSearchValue(search.view);
  const rawStatus = optionalSearchValue(search.status);
  return {
    view: rawView === "compare" || rawView === "results" || rawView === "gates" ? rawView : "runs",
    runId: optionalSearchValue(search.runId),
    candidateRunId: optionalSearchValue(search.candidateRunId),
    baselineRunId: optionalSearchValue(search.baselineRunId),
    gateId: optionalSearchValue(search.gateId),
    status:
      rawStatus === "running" || rawStatus === "completed" || rawStatus === "failed"
        ? rawStatus
        : undefined,
    range: parseMetricsRange(search.range),
    suite: optionalSearchValue(search.suite),
    metric: optionalSearchValue(search.metric),
    outcome: evaluationOutcomes.includes(rawOutcome as EvaluationOutcome)
      ? (rawOutcome as EvaluationOutcome)
      : undefined,
    environment: optionalSearchValue(search.environment),
    release: optionalSearchValue(search.release),
    search: optionalSearchValue(search.search),
    sort: evaluationSortFields.includes(search.sort as EvaluationSortField)
      ? (search.sort as EvaluationSortField)
      : "timestamp",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
  };
}

export function validateEvaluationRunsSearch(
  search: Record<string, unknown>,
): EvaluationRunsSearch {
  return {
    range: parseMetricsRange(search.range),
    statuses: searchValues(search.statuses ?? search.status).filter(
      (value): value is "running" | "completed" | "failed" =>
        value === "running" || value === "completed" || value === "failed",
    ),
    suites: searchValues(search.suites ?? search.suite),
    environments: searchValues(search.environments ?? search.environment),
    releases: searchValues(search.releases ?? search.release),
    search: optionalSearchValue(search.search),
    sort: evaluationRunSortFields.includes(search.sort as EvaluationRunSortField)
      ? (search.sort as EvaluationRunSortField)
      : "startedAt",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validEvaluationRunColumns(search.columns),
  };
}

export function validateEvaluationResultsSearch(
  search: Record<string, unknown>,
): EvaluationResultsSearch {
  return {
    range: parseMetricsRange(search.range),
    suites: searchValues(search.suites ?? search.suite),
    metrics: searchValues(search.metrics ?? search.metric),
    outcomes: searchValues(search.outcomes ?? search.outcome).filter((value) =>
      evaluationOutcomes.includes(value as EvaluationOutcome),
    ) as EvaluationOutcome[],
    environments: searchValues(search.environments ?? search.environment),
    releases: searchValues(search.releases ?? search.release),
    search: optionalSearchValue(search.search),
    sort: evaluationSortFields.includes(search.sort as EvaluationSortField)
      ? (search.sort as EvaluationSortField)
      : "timestamp",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validEvaluationResultColumns(search.columns),
  };
}

export function validateEvaluationCompareSearch(
  search: Record<string, unknown>,
): EvaluationCompareSearch {
  return {
    candidateRunId: optionalSearchValue(search.candidateRunId),
    baselineRunId: optionalSearchValue(search.baselineRunId),
    gateId: optionalSearchValue(search.gateId),
  };
}

export function validateOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return { range: parseMetricsRange(search.range) };
}

export function validateTraceDetailSearch(search: Record<string, unknown>): TraceDetailSearch {
  return {
    view: search.view === "timeline" ? "timeline" : undefined,
    span: optionalSearchValue(search.span),
  };
}

export function validateTraceCompareSearch(search: Record<string, unknown>): TraceCompareSearch {
  return { traceIds: searchValues(search.traceIds).slice(0, 4) };
}

export function validateSessionsSearch(search: Record<string, unknown>): SessionsSearch {
  return {
    range: parseMetricsRange(search.range),
    statuses: searchValues(search.statuses ?? search.status).filter(
      (value): value is SessionStatus => value === "success" || value === "error",
    ),
    users: searchValues(search.users ?? search.user),
    services: searchValues(search.services ?? search.service),
    models: searchValues(search.models ?? search.model),
    environments: searchValues(search.environments ?? search.environment),
    tags: searchValues(search.tags ?? search.tag),
    search: optionalSearchValue(search.search),
    minDurationMs: optionalNonNegativeNumber(search.minDurationMs),
    maxDurationMs: optionalNonNegativeNumber(search.maxDurationMs),
    minTotalTokens: optionalNonNegativeNumber(search.minTotalTokens),
    maxTotalTokens: optionalNonNegativeNumber(search.maxTotalTokens),
    minTotalCost: optionalNonNegativeNumber(search.minTotalCost),
    maxTotalCost: optionalNonNegativeNumber(search.maxTotalCost),
    sort: sessionSortFields.includes(search.sort as SessionSortField)
      ? (search.sort as SessionSortField)
      : "startedAt",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validSessionColumns(search.columns),
  };
}

export function validateTracesSearch(search: Record<string, unknown>): TracesSearch {
  return {
    range: parseMetricsRange(search.range),
    statuses: searchValues(search.statuses ?? search.status).filter(
      (value): value is SpanStatus => value === "ok" || value === "error" || value === "unset",
    ),
    services: searchValues(search.services ?? search.service),
    names: searchValues(search.names),
    models: searchValues(search.models ?? search.model),
    environments: searchValues(search.environments),
    releases: searchValues(search.releases),
    versions: searchValues(search.versions),
    serviceVersions: searchValues(search.serviceVersions),
    tags: searchValues(search.tags),
    userId: optionalSearchValue(search.userId),
    sessionId: optionalSearchValue(search.sessionId),
    traceId: optionalSearchValue(search.traceId),
    search: optionalSearchValue(search.search),
    minDurationMs: optionalNonNegativeNumber(search.minDurationMs),
    maxDurationMs: optionalNonNegativeNumber(search.maxDurationMs),
    minTotalTokens: optionalNonNegativeNumber(search.minTotalTokens),
    maxTotalTokens: optionalNonNegativeNumber(search.maxTotalTokens),
    minTotalCost: optionalNonNegativeNumber(search.minTotalCost),
    maxTotalCost: optionalNonNegativeNumber(search.maxTotalCost),
    sort: isTraceSortField(search.sort) ? search.sort : "startedAt",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validTraceColumns(search.columns),
  };
}

export function timeRangeForPreset(range: MetricsRangePreset) {
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  return {
    from: new Date(Date.now() - hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
}

export function timeRangeForUserRange(range: UserRange) {
  return range === "all" ? {} : timeRangeForPreset(range);
}

export function validateUsersSearch(search: Record<string, unknown>): UsersSearch {
  return {
    range: parseUserRange(search.range),
    search: optionalSearchValue(search.search),
    sort: userSortFields.includes(search.sort as UserSortField)
      ? (search.sort as UserSortField)
      : "lastSeenAt",
    order: search.order === "asc" ? "asc" : "desc",
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    columns: validUserColumns(search.columns),
  };
}

export function validateUserDetailSearch(search: Record<string, unknown>): UserDetailSearch {
  const tab = search.tab === "sessions" ? "sessions" : "traces";
  const sort =
    tab === "traces"
      ? traceSortFields.includes(search.sort as TraceSortField)
        ? (search.sort as TraceSortField)
        : "startedAt"
      : sessionSortFields.includes(search.sort as SessionSortField)
        ? (search.sort as SessionSortField)
        : "startedAt";
  return {
    range: parseUserRange(search.range),
    tab,
    page: positiveInteger(search.page, 1),
    pageSize: search.pageSize === 25 || search.pageSize === 100 ? search.pageSize : 50,
    sort,
    order: search.order === "asc" ? "asc" : "desc",
  };
}

export function traceActiveFilterCount(filters: ResolvedTracesSearch): number {
  const facets = [
    filters.statuses,
    filters.services,
    filters.names,
    filters.models,
    filters.environments,
    filters.releases,
    filters.versions,
    filters.serviceVersions,
    filters.tags,
  ];
  return (
    facets.filter((values) => (values?.length ?? 0) > 0).length +
    [
      filters.userId,
      filters.sessionId,
      filters.traceId,
      filters.search,
      filters.minDurationMs,
      filters.maxDurationMs,
      filters.minTotalTokens,
      filters.maxTotalTokens,
      filters.minTotalCost,
      filters.maxTotalCost,
    ].filter((value) => value !== undefined).length
  );
}

export function sessionActiveFilterCount(filters: ResolvedSessionsSearch): number {
  return (
    [
      filters.statuses,
      filters.users,
      filters.services,
      filters.models,
      filters.environments,
      filters.tags,
    ].filter((values) => (values?.length ?? 0) > 0).length +
    [
      filters.search,
      filters.minDurationMs,
      filters.maxDurationMs,
      filters.minTotalTokens,
      filters.maxTotalTokens,
      filters.minTotalCost,
      filters.maxTotalCost,
    ].filter((value) => value !== undefined).length
  );
}

export function evaluationRunActiveFilterCount(filters: ResolvedEvaluationRunsSearch): number {
  return (
    [filters.statuses, filters.suites, filters.environments, filters.releases].filter(
      (values) => (values?.length ?? 0) > 0,
    ).length + (filters.search === undefined ? 0 : 1)
  );
}

export function evaluationResultActiveFilterCount(
  filters: ResolvedEvaluationResultsSearch,
): number {
  return (
    [
      filters.suites,
      filters.metrics,
      filters.outcomes,
      filters.environments,
      filters.releases,
    ].filter((values) => (values?.length ?? 0) > 0).length + (filters.search === undefined ? 0 : 1)
  );
}

export function adaptiveRefreshInterval(range: MetricsRangePreset): RefreshInterval {
  return range === "24h" ? "5s" : "30s";
}

export function refreshMilliseconds(interval: RefreshInterval): number | false {
  return interval === "Off" ? false : Number.parseInt(interval, 10) * 1_000;
}

export function comparisonDelta(current: number, previous: number, mode: "relative" | "points") {
  if (mode === "points") {
    const change = (current - previous) * 100;
    const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
    return {
      direction,
      label: `${arrow} ${Math.abs(change).toFixed(1)} pp`,
      accessibleLabel: `${Math.abs(change).toFixed(1)} percentage points ${direction}`,
      hasPreviousPeriodComparison: true,
    } as const;
  }
  if (previous === 0 && current > 0) {
    return {
      direction: "up",
      label: "No prior baseline",
      accessibleLabel: "No prior baseline",
      hasPreviousPeriodComparison: false,
    } as const;
  }
  const change = previous === 0 ? 0 : (current - previous) / Math.abs(previous);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  return {
    direction,
    label: `${arrow} ${Math.abs(change * 100).toFixed(1)}%`,
    accessibleLabel: `${Math.abs(change * 100).toFixed(1)} percent ${direction}`,
    hasPreviousPeriodComparison: true,
  } as const;
}

function parseMetricsRange(value: unknown): MetricsRangePreset {
  return metricsRangePresets.includes(value as MetricsRangePreset)
    ? (value as MetricsRangePreset)
    : "24h";
}

function parseUserRange(value: unknown): UserRange {
  return value === "all"
    ? "all"
    : metricsRangePresets.includes(value as MetricsRangePreset)
      ? (value as MetricsRangePreset)
      : "all";
}

function optionalSearchValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function searchValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return Array.from(
    new Set(
      values
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isTraceSortField(value: unknown): value is TraceSortField {
  return traceSortFields.includes(value as TraceSortField);
}

function validTraceColumns(value: unknown): TraceColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultTraceColumns;
  selected.add("trace");
  return traceColumnIds.filter((column) => selected.has(column));
}

function validSessionColumns(value: unknown): SessionColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultSessionColumns;
  selected.add("session");
  return sessionColumnIds.filter((column) => selected.has(column));
}

function validEvaluationRunColumns(value: unknown): EvaluationRunColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultEvaluationRunColumns;
  selected.add("suite");
  return evaluationRunColumnIds.filter((column) => selected.has(column));
}

function validEvaluationResultColumns(value: unknown): EvaluationResultColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultEvaluationResultColumns;
  selected.add("suiteCase");
  return evaluationResultColumnIds.filter((column) => selected.has(column));
}

function validUserColumns(value: unknown): UserColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultUserColumns;
  selected.add("userId");
  return userColumnIds.filter((column) => selected.has(column));
}
