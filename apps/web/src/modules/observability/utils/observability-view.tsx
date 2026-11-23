import type {
  MetricsRangePreset,
  RunFacets,
  RunListItem,
  RunSortField,
  SessionFacets,
  SessionSortField,
  SessionStatus,
  SessionSummary,
  TraceFacets,
  TraceSortField,
  TraceStatus,
  TraceSummary,
} from "@lens/contracts";
import { metricsRangePresets, sessionSortFields, traceSortFields } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { CompactValues } from "../components/compact-values";
import { ObservationGlyph } from "../components/observation-glyph";
import { SessionNameCell } from "../components/session-name-cell";
import { SessionOpenCell } from "../components/session-open-cell";
import { SessionStatusBadge } from "../components/session-status-badge";
import { StatusBadge } from "../components/status-badge";
import { formatTableTimestamp, TableTimestamp } from "../components/table-timestamp";
import { TraceNameCell } from "../components/trace-name-cell";
import { TraceOpenCell } from "../components/trace-open-cell";
import {
  defaultSessionColumns,
  defaultTraceColumns,
  type OverviewSearch,
  type RefreshInterval,
  type ResolvedSessionsSearch,
  type ResolvedTracesSearch,
  type RunColumnId,
  type SessionColumnId,
  type SessionsSearch,
  sessionColumnIds,
  type TraceColumnId,
  type TraceDetailSearch,
  type TracesSearch,
  traceColumnIds,
} from "../types";
import { SortHeaderButton } from "../components/sort-header-button";

export function validateOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return { range: parseMetricsRange(search.range) };
}

export function validateTraceDetailSearch(search: Record<string, unknown>): TraceDetailSearch {
  return {
    view:
      search.view === "trajectory" ||
      search.view === "tree" ||
      search.view === "timeline" ||
      search.view === "graph"
        ? search.view
        : undefined,
    span: optionalSearchValue(search.span),
  };
}

export function validateSessionsSearch(search: Record<string, unknown>): SessionsSearch {
  return {
    range: parseMetricsRange(search.range),
    statuses: searchValues(search.statuses ?? search.status).filter(
      (value): value is SessionStatus =>
        value === "running" || value === "success" || value === "error",
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
      (value): value is TraceStatus =>
        value === "running" || value === "ok" || value === "error" || value === "unset",
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

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
export const traceColumnHelper = createColumnHelper<typeof dataTableFeatures, TraceSummary>();
export const runColumnHelper = createColumnHelper<typeof dataTableFeatures, RunListItem>();
export const sessionColumnHelper = createColumnHelper<typeof dataTableFeatures, SessionSummary>();

export function traceTableColumns(options: {
  visible: TraceColumnId[];
  sort?: TraceSortField;
  order?: "asc" | "desc";
  onSort?: (sort: TraceSortField) => void;
}) {
  const header = (label: string, sort: TraceSortField) => () =>
    options.onSort ? (
      <SortHeaderButton
        label={label}
        active={options.sort === sort}
        order={options.order}
        onClick={() => options.onSort?.(sort)}
      />
    ) : (
      label
    );
  const columnsById = {
    startedAt: traceColumnHelper.accessor("startedAt", {
      header: header("Started", "startedAt"),
      cell: ({ row }) => <TableTimestamp value={row.original.startedAt} />,
    }),
    trace: traceColumnHelper.accessor("name", {
      id: "trace",
      header: header("Trace", "name"),
      cell: ({ row }) => <TraceNameCell trace={row.original} />,
    }),
    status: traceColumnHelper.accessor("status", {
      header: header("Status", "status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    }),
    inputPreview: traceColumnHelper.accessor("inputPreview", {
      header: () => "Input",
      cell: ({ row }) =>
        row.original.inputPreview ? (
          <span
            className="block max-w-64 truncate text-xs text-muted-foreground"
            title={row.original.inputPreview}
          >
            {row.original.inputPreview}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    outputPreview: traceColumnHelper.accessor("outputPreview", {
      header: () => "Output",
      cell: ({ row }) =>
        row.original.outputPreview ? (
          <span
            className="block max-w-64 truncate text-xs text-muted-foreground"
            title={row.original.outputPreview}
          >
            {row.original.outputPreview}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    review: traceColumnHelper.accessor("reviewOutcome", {
      header: "Review",
      cell: ({ row }) =>
        row.original.reviewOutcome ? (
          <Badge variant={row.original.reviewOutcome === "fail" ? "destructive" : "secondary"}>
            {row.original.reviewOutcome === "fail" ? "Fail" : "Pass"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    durationMs: traceColumnHelper.accessor("durationMs", {
      header: header("Duration", "durationMs"),
      cell: ({ row }) => (
        <span className="font-mono">{formatListDuration(row.original.durationMs)}</span>
      ),
    }),
    totalCost: traceColumnHelper.accessor("totalCost", {
      header: header("Cost", "totalCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.totalCost)}</span>,
    }),
    model: traceColumnHelper.accessor("model", {
      header: header("Model", "model"),
      cell: ({ row }) => row.original.model ?? "—",
    }),
    totalTokens: traceColumnHelper.accessor("totalTokens", {
      header: header("Tokens", "totalTokens"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-xs">
          {formatNumber(row.original.totalTokens)}
          <span className="text-muted-foreground">
            {` · ${formatNumber(row.original.inputTokens)} in · ${formatNumber(row.original.outputTokens)} out`}
          </span>
        </span>
      ),
    }),
    environment: traceColumnHelper.accessor("environment", {
      header: header("Environment", "environment"),
      cell: ({ row }) => <Badge variant="secondary">{row.original.environment}</Badge>,
    }),
    userId: traceColumnHelper.accessor("userId", {
      header: header("User", "userId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? "—"}</span>,
    }),
    sessionId: traceColumnHelper.accessor("sessionId", {
      header: header("Thread", "sessionId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sessionId ?? "—"}</span>,
    }),
    serviceName: traceColumnHelper.accessor("serviceName", {
      header: header("Service", "serviceName"),
    }),
    release: traceColumnHelper.accessor("release", {
      header: header("Release", "release"),
      cell: ({ row }) => row.original.release ?? "—",
    }),
    version: traceColumnHelper.accessor("version", {
      header: header("Trace version", "version"),
      cell: ({ row }) => row.original.version ?? "—",
    }),
    serviceVersion: traceColumnHelper.accessor("serviceVersion", {
      header: header("Service version", "serviceVersion"),
      cell: ({ row }) => row.original.serviceVersion ?? "—",
    }),
    inputCost: traceColumnHelper.accessor("inputCost", {
      header: header("Input cost", "inputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.inputCost)}</span>,
    }),
    outputCost: traceColumnHelper.accessor("outputCost", {
      header: header("Output cost", "outputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.outputCost)}</span>,
    }),
    inputTokens: traceColumnHelper.accessor("inputTokens", {
      header: header("Input tokens", "inputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.inputTokens)}</span>
      ),
    }),
    outputTokens: traceColumnHelper.accessor("outputTokens", {
      header: header("Output tokens", "outputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.outputTokens)}</span>
      ),
    }),
    spanCount: traceColumnHelper.accessor("spanCount", {
      header: header("Spans", "spanCount"),
    }),
    generationCount: traceColumnHelper.accessor("generationCount", {
      header: header("Generations", "generationCount"),
    }),
    toolCount: traceColumnHelper.accessor("toolCount", {
      header: header("Tools", "toolCount"),
    }),
    tags: traceColumnHelper.accessor("tags", {
      header: () => "Tags",
      cell: ({ row }) => (
        <div className="flex max-w-72 flex-wrap gap-1 whitespace-normal">
          {row.original.tags.length === 0
            ? "—"
            : row.original.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
        </div>
      ),
    }),
    endedAt: traceColumnHelper.accessor("endedAt", {
      header: header("Ended", "endedAt"),
      cell: ({ row }) => relativeTime(row.original.endedAt),
    }),
    traceId: traceColumnHelper.accessor("traceId", {
      header: header("Trace ID", "traceId"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-xs text-primary">
          {row.original.traceId}
        </span>
      ),
    }),
  };
  return traceColumnHelper.columns([
    ...options.visible.map((column) => columnsById[column]),
    traceColumnHelper.display({
      id: "open",
      header: () => <span className="sr-only">Open</span>,
      cell: ({ row }) => <TraceOpenCell trace={row.original} />,
    }),
  ] as Parameters<typeof traceColumnHelper.columns>[0]);
}

export function runTableColumns(options: {
  projectId: string;
  visible: RunColumnId[];
  sort?: RunSortField;
  order?: "asc" | "desc";
  onSort?: (sort: RunSortField) => void;
}) {
  const header = (label: string, sort: RunSortField) => () =>
    options.onSort ? (
      <SortHeaderButton
        label={label}
        active={options.sort === sort}
        order={options.order}
        onClick={() => options.onSort?.(sort)}
      />
    ) : (
      label
    );
  const columnsById = {
    startedAt: runColumnHelper.accessor("startedAt", {
      header: header("Started", "startedAt"),
      cell: ({ row }) => <TableTimestamp value={row.original.startedAt} />,
    }),
    observationKind: runColumnHelper.accessor("observationKind", {
      header: header("Type", "observationKind"),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <ObservationGlyph kind={row.original.observationKind} status={row.original.status} />
          <span className="text-xs capitalize">{row.original.observationKind}</span>
        </span>
      ),
    }),
    name: runColumnHelper.accessor("name", {
      header: header("Name", "name"),
      cell: ({ row }) => (
        <span className="block max-w-56 truncate font-medium" title={row.original.name}>
          {row.original.name}
        </span>
      ),
    }),
    status: runColumnHelper.accessor("status", {
      header: header("Status", "status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    }),
    inputPreview: runColumnHelper.accessor("inputPreview", {
      header: () => "Input",
      cell: ({ row }) =>
        row.original.inputPreview ? (
          <span
            className="block max-w-64 truncate text-xs text-muted-foreground"
            title={row.original.inputPreview}
          >
            {row.original.inputPreview}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    outputPreview: runColumnHelper.accessor("outputPreview", {
      header: () => "Output",
      cell: ({ row }) =>
        row.original.outputPreview ? (
          <span
            className="block max-w-64 truncate text-xs text-muted-foreground"
            title={row.original.outputPreview}
          >
            {row.original.outputPreview}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    durationMs: runColumnHelper.accessor("durationMs", {
      header: header("Duration", "durationMs"),
      cell: ({ row }) => (
        <span className="font-mono">{formatListDuration(row.original.durationMs)}</span>
      ),
    }),
    model: runColumnHelper.accessor("model", {
      header: header("Model", "model"),
      cell: ({ row }) => row.original.model ?? "—",
    }),
    totalTokens: runColumnHelper.accessor("totalTokens", {
      header: header("Tokens", "totalTokens"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-xs">
          {formatNumber(row.original.totalTokens)}
          <span className="text-muted-foreground">
            {` · ${formatNumber(row.original.inputTokens)} in · ${formatNumber(row.original.outputTokens)} out`}
          </span>
        </span>
      ),
    }),
    totalCost: runColumnHelper.accessor("totalCost", {
      header: header("Cost", "totalCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.totalCost)}</span>,
    }),
    serviceName: runColumnHelper.accessor("serviceName", {
      header: header("Service", "serviceName"),
    }),
    environment: runColumnHelper.accessor("environment", {
      header: header("Environment", "environment"),
      cell: ({ row }) => <Badge variant="secondary">{row.original.environment}</Badge>,
    }),
    traceId: runColumnHelper.accessor("traceId", {
      header: header("Trace", "traceId"),
      cell: ({ row }) => (
        <Link
          className="whitespace-nowrap font-mono text-xs text-primary hover:underline"
          to="/$projectId/traces/$traceId"
          params={{ projectId: options.projectId, traceId: row.original.traceId }}
          search={{ span: row.original.spanId }}
          onClick={(event) => event.stopPropagation()}
        >
          {shortId(row.original.traceId)}
        </Link>
      ),
    }),
    userId: runColumnHelper.accessor("userId", {
      header: header("User", "userId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? "—"}</span>,
    }),
    sessionId: runColumnHelper.accessor("sessionId", {
      header: header("Thread", "sessionId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sessionId ?? "—"}</span>,
    }),
    inputTokens: runColumnHelper.accessor("inputTokens", {
      header: header("Input tokens", "inputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.inputTokens)}</span>
      ),
    }),
    outputTokens: runColumnHelper.accessor("outputTokens", {
      header: header("Output tokens", "outputTokens"),
      cell: ({ row }) => (
        <span className="font-mono">{formatNumber(row.original.outputTokens)}</span>
      ),
    }),
    inputCost: runColumnHelper.accessor("inputCost", {
      header: header("Input cost", "inputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.inputCost)}</span>,
    }),
    outputCost: runColumnHelper.accessor("outputCost", {
      header: header("Output cost", "outputCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.outputCost)}</span>,
    }),
    release: runColumnHelper.accessor("release", {
      header: header("Release", "release"),
      cell: ({ row }) => row.original.release ?? "—",
    }),
    version: runColumnHelper.accessor("version", {
      header: header("Version", "version"),
      cell: ({ row }) => row.original.version ?? "—",
    }),
    serviceVersion: runColumnHelper.accessor("serviceVersion", {
      header: header("Service version", "serviceVersion"),
      cell: ({ row }) => row.original.serviceVersion ?? "—",
    }),
    tags: runColumnHelper.accessor("tags", {
      header: () => "Tags",
      cell: ({ row }) => (
        <div className="flex max-w-72 flex-wrap gap-1 whitespace-normal">
          {row.original.tags.length === 0
            ? "—"
            : row.original.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
        </div>
      ),
    }),
    endedAt: runColumnHelper.accessor("endedAt", {
      header: header("Ended", "endedAt"),
      cell: ({ row }) => relativeTime(row.original.endedAt),
    }),
  };
  return runColumnHelper.columns(
    options.visible.map((column) => columnsById[column]) as Parameters<
      typeof runColumnHelper.columns
    >[0],
  );
}

export function sessionTableColumns(options: {
  visible: SessionColumnId[];
  sort: SessionSortField;
  order: "asc" | "desc";
  onSort: (sort: SessionSortField) => void;
}) {
  const header = (label: string, sort: SessionSortField) => () => (
    <SortHeaderButton
      label={label}
      active={options.sort === sort}
      order={options.order}
      onClick={() => options.onSort(sort)}
    />
  );
  const columnsById = {
    startedAt: sessionColumnHelper.accessor("startedAt", {
      header: header("Started", "startedAt"),
      cell: ({ row }) => <TableTimestamp value={row.original.startedAt} />,
    }),
    session: sessionColumnHelper.accessor("sessionId", {
      id: "session",
      header: header("Thread", "sessionId"),
      cell: ({ row }) => <SessionNameCell session={row.original} />,
    }),
    status: sessionColumnHelper.accessor("status", {
      header: header("Status", "status"),
      cell: ({ row }) => <SessionStatusBadge summary={row.original} />,
    }),
    userId: sessionColumnHelper.accessor("userId", {
      header: header("User", "userId"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId ?? "—"}</span>,
    }),
    traceCount: sessionColumnHelper.accessor("traceCount", {
      header: header("Traces", "traceCount"),
      cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.traceCount)}</span>,
    }),
    spanCount: sessionColumnHelper.accessor("spanCount", {
      header: header("Spans", "spanCount"),
      cell: ({ row }) => <span className="font-mono">{formatNumber(row.original.spanCount)}</span>,
    }),
    durationMs: sessionColumnHelper.accessor("durationMs", {
      header: header("Duration", "durationMs"),
      cell: ({ row }) => (
        <span className="font-mono">{formatListDuration(row.original.durationMs)}</span>
      ),
    }),
    totalTokens: sessionColumnHelper.accessor("totalTokens", {
      header: header("Tokens", "totalTokens"),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-xs">
          {formatNumber(row.original.totalTokens)}
          <span className="text-muted-foreground">
            {` · ${formatNumber(row.original.inputTokens)} in · ${formatNumber(row.original.outputTokens)} out`}
          </span>
        </span>
      ),
    }),
    totalCost: sessionColumnHelper.accessor("totalCost", {
      header: header("Cost", "totalCost"),
      cell: ({ row }) => <span className="font-mono">{formatCost(row.original.totalCost)}</span>,
    }),
    environments: sessionColumnHelper.accessor("environments", {
      header: () => "Environments",
      cell: ({ row }) => <CompactValues values={row.original.environments} />,
    }),
    services: sessionColumnHelper.accessor("services", {
      header: () => "Services",
      cell: ({ row }) => <CompactValues values={row.original.services} />,
    }),
    lastSeenAt: sessionColumnHelper.accessor("lastSeenAt", {
      header: header("Last seen", "lastSeenAt"),
      cell: ({ row }) => relativeTime(row.original.lastSeenAt),
    }),
  };
  return sessionColumnHelper.columns([
    ...options.visible.map((column) => columnsById[column]),
    sessionColumnHelper.display({
      id: "open",
      header: () => <span className="sr-only">Open</span>,
      cell: ({ row }) => <SessionOpenCell session={row.original} />,
    }),
  ] as Parameters<typeof sessionColumnHelper.columns>[0]);
}

export const traceColumnLabels: Record<TraceColumnId, string> = {
  startedAt: "Started",
  trace: "Trace",
  status: "Status",
  inputPreview: "Input",
  outputPreview: "Output",
  review: "Review",
  durationMs: "Duration",
  totalCost: "Total cost",
  model: "Model",
  totalTokens: "Total tokens",
  environment: "Environment",
  userId: "User",
  sessionId: "Thread",
  serviceName: "Service",
  release: "Release",
  version: "Trace version",
  serviceVersion: "Service version",
  inputCost: "Input cost",
  outputCost: "Output cost",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  spanCount: "Spans",
  generationCount: "Generations",
  toolCount: "Tools",
  tags: "Tags",
  endedAt: "Ended",
  traceId: "Trace ID",
};

export const runColumnLabels: Record<RunColumnId, string> = {
  startedAt: "Started",
  observationKind: "Type",
  name: "Name",
  status: "Status",
  inputPreview: "Input",
  outputPreview: "Output",
  durationMs: "Duration",
  model: "Model",
  totalTokens: "Total tokens",
  totalCost: "Total cost",
  serviceName: "Service",
  environment: "Environment",
  traceId: "Trace",
  userId: "User",
  sessionId: "Thread",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  inputCost: "Input cost",
  outputCost: "Output cost",
  release: "Release",
  version: "Version",
  serviceVersion: "Service version",
  tags: "Tags",
  endedAt: "Ended",
};

export type RunFacetFilterField =
  | "observationKinds"
  | "statuses"
  | "services"
  | "names"
  | "models"
  | "environments"
  | "releases"
  | "versions"
  | "serviceVersions"
  | "tags";

export const runFacetSections: Array<{
  id: keyof RunFacets;
  field: RunFacetFilterField;
  label: string;
}> = [
  { id: "observationKind", field: "observationKinds", label: "Type" },
  { id: "status", field: "statuses", label: "Status" },
  { id: "model", field: "models", label: "Model" },
  { id: "name", field: "names", label: "Run name" },
  { id: "service", field: "services", label: "Service" },
  { id: "environment", field: "environments", label: "Environment" },
  { id: "release", field: "releases", label: "Release" },
  { id: "version", field: "versions", label: "Version" },
  { id: "serviceVersion", field: "serviceVersions", label: "Service version" },
  { id: "tag", field: "tags", label: "Tags" },
];

export type TraceFacetFilterField =
  | "statuses"
  | "services"
  | "names"
  | "models"
  | "environments"
  | "releases"
  | "versions"
  | "serviceVersions"
  | "tags";

export const traceFacetSections: Array<{
  id: keyof TraceFacets;
  field: TraceFacetFilterField;
  label: string;
}> = [
  { id: "status", field: "statuses", label: "Status" },
  { id: "environment", field: "environments", label: "Environment" },
  { id: "name", field: "names", label: "Trace name" },
  { id: "service", field: "services", label: "Service" },
  { id: "model", field: "models", label: "Model" },
  { id: "release", field: "releases", label: "Release" },
  { id: "version", field: "versions", label: "Trace version" },
  { id: "serviceVersion", field: "serviceVersions", label: "Service version" },
  { id: "tag", field: "tags", label: "Tags" },
];

export function _traceActiveFilterCount(filters: ResolvedTracesSearch): number {
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

export const sessionColumnLabels: Record<SessionColumnId, string> = {
  startedAt: "Started",
  session: "Thread",
  status: "Status",
  userId: "User",
  traceCount: "Traces",
  spanCount: "Spans",
  durationMs: "Duration",
  totalTokens: "Tokens",
  totalCost: "Cost",
  environments: "Environments",
  services: "Services",
  lastSeenAt: "Last seen",
};

export type SessionFacetFilterField =
  | "statuses"
  | "users"
  | "services"
  | "models"
  | "environments"
  | "tags";

export const sessionFacetSections: Array<{
  id: keyof SessionFacets;
  field: SessionFacetFilterField;
  label: string;
}> = [
  { id: "status", field: "statuses", label: "Status" },
  { id: "user", field: "users", label: "User" },
  { id: "environment", field: "environments", label: "Environment" },
  { id: "service", field: "services", label: "Service" },
  { id: "model", field: "models", label: "Model" },
  { id: "tag", field: "tags", label: "Tags" },
];

export function _sessionActiveFilterCount(filters: ResolvedSessionsSearch): number {
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

export function timeRange(hours: number) {
  return {
    from: new Date(Date.now() - hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
}
export function _timeRangeForPreset(range: MetricsRangePreset) {
  return timeRange(range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30);
}
export function parseMetricsRange(value: unknown): MetricsRangePreset {
  return metricsRangePresets.includes(value as MetricsRangePreset)
    ? (value as MetricsRangePreset)
    : "24h";
}
export function optionalSearchValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
export function searchValues(value: unknown): string[] {
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
export function optionalNonNegativeNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
export function positiveInteger(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export function isTraceSortField(value: unknown): value is TraceSortField {
  return traceSortFields.includes(value as TraceSortField);
}
export function validTraceColumns(value: unknown): TraceColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultTraceColumns;
  selected.add("trace");
  return traceColumnIds.filter((column) => selected.has(column));
}
export function validSessionColumns(value: unknown): SessionColumnId[] {
  const selected = new Set(searchValues(value));
  if (selected.size === 0) return defaultSessionColumns;
  selected.add("session");
  return sessionColumnIds.filter((column) => selected.has(column));
}
export function adaptiveRefreshInterval(range: MetricsRangePreset): RefreshInterval {
  return range === "24h" ? "5s" : "30s";
}
export function refreshMilliseconds(interval: RefreshInterval): number | false {
  return interval === "Off" ? false : Number.parseInt(interval, 10) * 1_000;
}
const standardNumberFormat = new Intl.NumberFormat("en", { notation: "standard" });
const compactNumberFormat = new Intl.NumberFormat("en", { notation: "compact" });
const decimalOneFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const decimalZeroFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compactAxisFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const smallUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const standardUsdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatNumber(value?: number) {
  return value === undefined
    ? "—"
    : (value > 99_999 ? compactNumberFormat : standardNumberFormat).format(value);
}
export function formatDecimal(value?: number) {
  return value === undefined
    ? "—"
    : (value < 10 ? decimalOneFormat : decimalZeroFormat).format(value);
}
export function formatCompactAxis(value: number | string) {
  return compactAxisFormat.format(Number(value));
}
export function formatMetricTimestamp(value: string, range: MetricsRangePreset, detailed: boolean) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (detailed) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return range === "24h"
    ? date.toLocaleTimeString([], { hour: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
export function truncateChartLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}
export function formatPercent(value?: number) {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}
export function formatDuration(value?: number) {
  if (value === undefined) return "—";
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}
export function formatListDuration(value?: number) {
  if (value === undefined || value < 60_000) return formatDuration(value);
  const totalSeconds = Math.floor(value / 1_000);
  if (totalSeconds < 3_600) {
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  }
  return `${Math.floor(totalSeconds / 3_600)}h ${Math.floor((totalSeconds % 3_600) / 60)}m`;
}
export function formatCost(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return (value < 0.01 ? smallUsdFormat : standardUsdFormat).format(value);
}
export function formatTimestamp(value: string) {
  return formatTableTimestamp(value);
}
export function shortId(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
export function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
