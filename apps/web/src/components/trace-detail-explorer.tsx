import type { JsonValue, ObservationKind, SpanDetail, TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Input } from "@lens/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { cn } from "@lens/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Database,
  GanttChartSquare,
  ListTree,
  Search,
  ShieldCheck,
  Sparkles,
  UnfoldVertical,
  Wrench,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

export type TraceSpanView = "tree" | "timeline";
export type TracePayloadView = "formatted" | "json";

export type SpanTreeNode = {
  span: SpanDetail;
  children: SpanTreeNode[];
};

export type FlatSpanNode = {
  span: SpanDetail;
  depth: number;
  ancestorContinues: boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
};

type FormattedRow = {
  key: string;
  label: string;
  text: string;
  role?: string;
};

const TRACE_LAYOUT_STORAGE_KEY = "lens-trace-detail-layout-v1";
const TRACE_PAYLOAD_STORAGE_KEY = "lens-trace-payload-view";
const NAVIGATION_PANEL_ID = "trace-navigation";
const DETAIL_PANEL_ID = "trace-data";
const TIMELINE_WIDTH = 720;

export function buildSpanForest(spans: SpanDetail[]): SpanTreeNode[] {
  const ordered = [...spans].sort(compareSpans);
  const nodes = new Map(ordered.map((span) => [span.spanId, span]));
  const children = new Map<string, SpanDetail[]>();
  const roots: SpanDetail[] = [];

  for (const span of ordered) {
    const parent = span.parentSpanId;
    if (parent === null || parent === span.spanId || !nodes.has(parent)) {
      roots.push(span);
      continue;
    }
    children.set(parent, [...(children.get(parent) ?? []), span]);
  }

  const visited = new Set<string>();
  const build = (span: SpanDetail, ancestors: Set<string>): SpanTreeNode | null => {
    if (visited.has(span.spanId) || ancestors.has(span.spanId)) return null;
    visited.add(span.spanId);
    const nextAncestors = new Set(ancestors).add(span.spanId);
    return {
      span,
      children: (children.get(span.spanId) ?? [])
        .map((child) => build(child, nextAncestors))
        .filter((node): node is SpanTreeNode => node !== null),
    };
  };

  const forest = roots
    .map((span) => build(span, new Set()))
    .filter((node): node is SpanTreeNode => node !== null);
  for (const span of ordered) {
    if (visited.has(span.spanId)) continue;
    const recovered = build(span, new Set());
    if (recovered !== null) forest.push(recovered);
  }
  return forest;
}

export function flattenSpanForest(
  roots: SpanTreeNode[],
  collapsed: ReadonlySet<string> = new Set(),
): FlatSpanNode[] {
  const rows: FlatSpanNode[] = [];
  const visit = (nodes: SpanTreeNode[], depth: number, ancestorContinues: boolean[]) => {
    nodes.forEach((node, index) => {
      const isLastSibling = index === nodes.length - 1;
      rows.push({
        span: node.span,
        depth,
        ancestorContinues,
        isLastSibling,
        hasChildren: node.children.length > 0,
      });
      if (!collapsed.has(node.span.spanId)) {
        visit(node.children, depth + 1, [...ancestorContinues, !isLastSibling]);
      }
    });
  };
  visit(roots, 0, []);
  return rows;
}

export function searchTraceSpans(spans: SpanDetail[], query: string): SpanDetail[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [];
  return [...spans]
    .sort(compareSpans)
    .filter((span) =>
      [span.name, span.observationKind, span.serviceName, span.model, span.spanId]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(normalized)),
    );
}

export function traceTimelineBounds(detail: TraceDetail): { startMs: number; durationMs: number } {
  const starts = detail.spans.map(spanStartMs).filter(Number.isFinite);
  const ends = detail.spans.map(spanEndMs).filter(Number.isFinite);
  const summaryStart = Date.parse(detail.summary.startedAt);
  const summaryEnd = Date.parse(detail.summary.endedAt);
  if (Number.isFinite(summaryStart)) starts.push(summaryStart);
  if (Number.isFinite(summaryEnd)) ends.push(summaryEnd);
  const startMs = starts.length > 0 ? Math.min(...starts) : 0;
  const endMs = ends.length > 0 ? Math.max(...ends) : startMs;
  return { startMs, durationMs: Math.max(1, endMs - startMs) };
}

export function spanTimelinePosition(
  span: SpanDetail,
  bounds: { startMs: number; durationMs: number },
): { left: number; width: number } {
  const left = Math.max(0, Math.min(1, (spanStartMs(span) - bounds.startMs) / bounds.durationMs));
  const rawWidth = spanDurationMs(span) / bounds.durationMs;
  return {
    left: left * TIMELINE_WIDTH,
    width: Math.max(2, Math.min(TIMELINE_WIDTH - left * TIMELINE_WIDTH, rawWidth * TIMELINE_WIDTH)),
  };
}

export function rawTraceJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return String(value);
  }
}

export function jsonSyntaxTokens(json: string): Array<{
  text: string;
  type: "plain" | "key" | "string" | "number" | "boolean" | "null";
  start: number;
}> {
  const pattern =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/g;
  const tokens: Array<{
    text: string;
    type: "plain" | "key" | "string" | "number" | "boolean" | "null";
    start: number;
  }> = [];
  let cursor = 0;
  for (const match of json.matchAll(pattern)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: json.slice(cursor, index), type: "plain", start: cursor });
    }
    const following = json.slice(index + text.length).trimStart();
    const type = text.startsWith('"')
      ? following.startsWith(":")
        ? "key"
        : "string"
      : text === "true" || text === "false"
        ? "boolean"
        : text === "null"
          ? "null"
          : "number";
    tokens.push({ text, type, start: index });
    cursor = index + text.length;
  }
  if (cursor < json.length) {
    tokens.push({ text: json.slice(cursor), type: "plain", start: cursor });
  }
  return tokens;
}

export function formattedPayloadRows(title: string, value: unknown): FormattedRow[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") {
    return [{ key: `scalar:${title}`, label: title, text: String(value) }];
  }
  if (Array.isArray(value)) return formattedArrayRows(value, title);

  const record = value as Record<string, unknown>;
  const rows: FormattedRow[] = [];
  if (typeof record.instructions === "string" && record.instructions.trim().length > 0) {
    rows.push({
      key: "instructions",
      label: "System",
      role: "system",
      text: record.instructions,
    });
  }
  for (const key of ["messages", "chatHistory", "history", "prompt", "choice"] as const) {
    const nested = record[key];
    if (Array.isArray(nested)) rows.push(...formattedArrayRows(nested, labelText(key)));
  }
  if (rows.length > 0) return rows;

  return Object.entries(record).map(([key, item]) => ({
    key: `property:${key}`,
    label: labelText(key),
    role: messageRole(item),
    text: payloadText(item),
  }));
}

function formattedArrayRows(values: unknown[], parentLabel: string): FormattedRow[] {
  return values.map((item, index) => {
    const role = messageRole(item);
    const type = isRecord(item) && typeof item.type === "string" ? item.type : undefined;
    const label = role ?? (type === undefined ? `${parentLabel} ${index + 1}` : labelText(type));
    return {
      key: `${parentLabel}:${index}`,
      label: labelText(label),
      role,
      text: payloadText(item),
    };
  });
}

function messageRole(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.role === "string") return value.role.toLowerCase();
  if (value.type === "reasoning") return "reasoning";
  if (value.type === "tool_call" || value.type === "tool_result") return "tool";
  return undefined;
}

function payloadText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(payloadText).filter(Boolean).join("\n");
  if (isRecord(value)) {
    for (const key of ["text", "content", "message", "value", "result"] as const) {
      if (key in value) {
        const text = payloadText(value[key]);
        if (text.length > 0 && text !== "undefined") return text;
      }
    }
  }
  return rawTraceJson(value);
}

function labelText(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareSpans(left: SpanDetail, right: SpanDetail): number {
  try {
    const difference = BigInt(left.startTimeUnixNano) - BigInt(right.startTimeUnixNano);
    if (difference < 0n) return -1;
    if (difference > 0n) return 1;
  } catch {
    const difference = spanStartMs(left) - spanStartMs(right);
    if (difference !== 0) return difference;
  }
  return left.spanId.localeCompare(right.spanId);
}

function nanoToMs(value: string): number {
  try {
    return Number(BigInt(value) / 1_000_000n);
  } catch {
    return 0;
  }
}

function spanStartMs(span: SpanDetail): number {
  return nanoToMs(span.startTimeUnixNano);
}

function spanDurationMs(span: SpanDetail): number {
  return Math.max(0, nanoToMs(span.durationNano));
}

function spanEndMs(span: SpanDetail): number {
  const end = nanoToMs(span.endTimeUnixNano);
  return end > 0 ? end : spanStartMs(span) + spanDurationMs(span);
}

export function resolveSelectedSpan(
  spans: SpanDetail[],
  selectedSpanId?: string,
): SpanDetail | undefined {
  if (selectedSpanId !== undefined) {
    const selected = spans.find((span) => span.spanId === selectedSpanId);
    if (selected !== undefined) return selected;
  }
  const forest = buildSpanForest(spans);
  return forest[0]?.span ?? [...spans].sort(compareSpans)[0];
}

export function TraceDetailExplorer(props: {
  detail: TraceDetail;
  projectId: string;
  selectedSpanId?: string;
  view: TraceSpanView;
  onSelectSpan: (spanId: string) => void;
  onViewChange: (view: TraceSpanView) => void;
}) {
  const isMobile = useIsMobile();
  const forest = useMemo(() => buildSpanForest(props.detail.spans), [props.detail.spans]);
  const selected = resolveSelectedSpan(props.detail.spans, props.selectedSpanId);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<"tree" | "timeline" | "data">(() =>
    props.selectedSpanId ? "data" : props.view,
  );
  const [payloadView, setPayloadView] = useState<TracePayloadView>(() => storedPayloadView());
  const layout = useMemo(readStoredLayout, []);

  const selectSpan = (spanId: string) => {
    props.onSelectSpan(spanId);
    if (isMobile) setMobileTab("data");
  };
  const changePayloadView = (view: TracePayloadView) => {
    setPayloadView(view);
    try {
      window.localStorage.setItem(TRACE_PAYLOAD_STORAGE_KEY, view);
    } catch {
      // Local storage may be disabled; the in-memory preference still works.
    }
  };

  return (
    <main className="flex h-[calc(100svh-3.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden">
      <TraceHeader detail={props.detail} projectId={props.projectId} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          <MobileTraceLayout
            activeTab={mobileTab}
            collapsed={collapsed}
            detail={props.detail}
            forest={forest}
            payloadView={payloadView}
            search={search}
            selected={selected}
            selectedSpanId={selected?.spanId}
            onCollapsedChange={setCollapsed}
            onPayloadViewChange={changePayloadView}
            onSearchChange={setSearch}
            onSelectSpan={selectSpan}
            onTabChange={(tab) => {
              setMobileTab(tab);
              if (tab !== "data") props.onViewChange(tab);
            }}
          />
        ) : (
          <ResizablePanelGroup
            id="trace-detail-layout"
            orientation="horizontal"
            defaultLayout={layout}
            onLayoutChanged={(next, meta) => {
              if (!meta.isUserInteraction) return;
              try {
                window.localStorage.setItem(TRACE_LAYOUT_STORAGE_KEY, JSON.stringify(next));
              } catch {
                // Ignore unavailable storage.
              }
            }}
          >
            <ResizablePanel id={NAVIGATION_PANEL_ID} defaultSize="36" minSize={280} maxSize="55">
              <TraceNavigator
                collapsed={collapsed}
                detail={props.detail}
                forest={forest}
                search={search}
                selectedSpanId={selected?.spanId}
                view={props.view}
                onCollapsedChange={setCollapsed}
                onSearchChange={setSearch}
                onSelectSpan={selectSpan}
                onViewChange={props.onViewChange}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id={DETAIL_PANEL_ID} defaultSize="64" minSize={420}>
              {selected === undefined ? (
                <EmptyInspector />
              ) : (
                <SpanInspector
                  payloadView={payloadView}
                  span={selected}
                  onPayloadViewChange={changePayloadView}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </main>
  );
}

function readStoredLayout(): Record<string, number> | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(TRACE_LAYOUT_STORAGE_KEY) ?? "null");
    if (
      isRecord(value) &&
      typeof value[NAVIGATION_PANEL_ID] === "number" &&
      typeof value[DETAIL_PANEL_ID] === "number"
    ) {
      return {
        [NAVIGATION_PANEL_ID]: value[NAVIGATION_PANEL_ID],
        [DETAIL_PANEL_ID]: value[DETAIL_PANEL_ID],
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function storedPayloadView(): TracePayloadView {
  try {
    return window.localStorage.getItem(TRACE_PAYLOAD_STORAGE_KEY) === "json" ? "json" : "formatted";
  } catch {
    return "formatted";
  }
}

function MobileTraceLayout(props: {
  activeTab: "tree" | "timeline" | "data";
  collapsed: Set<string>;
  detail: TraceDetail;
  forest: SpanTreeNode[];
  payloadView: TracePayloadView;
  search: string;
  selected?: SpanDetail;
  selectedSpanId?: string;
  onCollapsedChange: (value: Set<string>) => void;
  onPayloadViewChange: (view: TracePayloadView) => void;
  onSearchChange: (value: string) => void;
  onSelectSpan: (id: string) => void;
  onTabChange: (tab: "tree" | "timeline" | "data") => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2" role="tablist">
        {(["tree", "timeline", "data"] as const).map((tab) => (
          <button
            className={cn(
              "h-8 rounded-md px-3 text-sm font-medium capitalize text-muted-foreground",
              props.activeTab === tab && "bg-muted text-foreground",
            )}
            key={tab}
            role="tab"
            aria-selected={props.activeTab === tab}
            type="button"
            onClick={() => props.onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.activeTab === "data" ? (
          props.selected === undefined ? (
            <EmptyInspector />
          ) : (
            <SpanInspector
              payloadView={props.payloadView}
              span={props.selected}
              onPayloadViewChange={props.onPayloadViewChange}
            />
          )
        ) : (
          <TraceNavigator
            collapsed={props.collapsed}
            detail={props.detail}
            forest={props.forest}
            hideModeSwitch
            search={props.search}
            selectedSpanId={props.selectedSpanId}
            view={props.activeTab}
            onCollapsedChange={props.onCollapsedChange}
            onSearchChange={props.onSearchChange}
            onSelectSpan={props.onSelectSpan}
            onViewChange={() => undefined}
          />
        )}
      </div>
    </div>
  );
}

function TraceHeader({ detail, projectId }: { detail: TraceDetail; projectId: string }) {
  const summary = detail.summary;
  return (
    <header className="shrink-0 border-b bg-background px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ObservationGlyph kind={detail.spans[0]?.observationKind ?? "span"} size="large" />
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{summary.name}</h1>
              <StatusPill status={summary.status} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatTimestamp(summary.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono" title={summary.traceId}>
                {shortId(summary.traceId)}
              </span>
              <Badge variant="outline">{summary.environment}</Badge>
              <Badge variant="outline">
                {summary.serviceName}
                {summary.serviceVersion ? `@${summary.serviceVersion}` : ""}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
          <HeaderMetric label="Duration" value={formatDuration(summary.durationMs)} />
          <HeaderMetric label="Spans" value={formatNumber(summary.spanCount)} />
          <HeaderMetric label="Tokens" value={formatNumber(summary.totalTokens)} />
          <HeaderMetric label="Cost" value={formatCost(summary.totalCost)} />
          {summary.sessionId ? (
            <Link
              className="grid min-w-24 gap-0.5 rounded-md border bg-muted/20 px-2.5 py-1.5 hover:bg-muted/60"
              to="/$projectId/sessions/$sessionId"
              params={{ projectId, sessionId: summary.sessionId }}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Session
              </span>
              <span className="max-w-32 truncate font-mono text-xs">{summary.sessionId}</span>
            </Link>
          ) : null}
        </div>
      </div>
      {summary.release || summary.version || summary.userId || summary.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.release ? <Badge variant="secondary">Release {summary.release}</Badge> : null}
          {summary.version ? <Badge variant="secondary">Version {summary.version}</Badge> : null}
          {summary.userId ? <Badge variant="outline">User {summary.userId}</Badge> : null}
          {summary.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-20 gap-0.5 rounded-md border bg-muted/20 px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs font-medium">{value}</span>
    </div>
  );
}

export function TraceNavigator(props: {
  collapsed: Set<string>;
  detail: TraceDetail;
  forest: SpanTreeNode[];
  hideModeSwitch?: boolean;
  search: string;
  selectedSpanId?: string;
  view: TraceSpanView;
  onCollapsedChange: (value: Set<string>) => void;
  onSearchChange: (value: string) => void;
  onSelectSpan: (id: string) => void;
  onViewChange: (view: TraceSpanView) => void;
}) {
  const rows = useMemo(
    () => flattenSpanForest(props.forest, props.collapsed),
    [props.collapsed, props.forest],
  );
  const searchResults = useMemo(
    () => searchTraceSpans(props.detail.spans, props.search),
    [props.detail.spans, props.search],
  );
  const branchIds = useMemo(
    () =>
      flattenSpanForest(props.forest)
        .filter((row) => row.hasChildren)
        .map((row) => row.span.spanId),
    [props.forest],
  );
  const everythingCollapsed =
    branchIds.length > 0 && branchIds.every((id) => props.collapsed.has(id));
  const toggleAll = () =>
    props.onCollapsedChange(everythingCollapsed ? new Set() : new Set(branchIds));

  return (
    <section
      className="flex h-full min-h-0 flex-col border-r bg-background"
      aria-label="Trace spans"
    >
      <div className="flex shrink-0 items-center gap-1 border-b p-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search spans"
            className="h-8 border-0 bg-transparent pl-7 shadow-none focus-visible:ring-1"
            placeholder="Search spans"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </div>
        <Button
          aria-label={everythingCollapsed ? "Expand all spans" : "Collapse all spans"}
          title={everythingCollapsed ? "Expand all" : "Collapse all"}
          size="icon-sm"
          variant="ghost"
          onClick={toggleAll}
        >
          {everythingCollapsed ? <UnfoldVertical /> : <ListTree />}
        </Button>
        {props.hideModeSwitch ? null : (
          <ViewModeSwitch value={props.view} onChange={props.onViewChange} />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.search.trim().length > 0 ? (
          <SearchResults
            results={searchResults}
            selectedSpanId={props.selectedSpanId}
            onSelectSpan={props.onSelectSpan}
            onClear={() => props.onSearchChange("")}
          />
        ) : rows.length === 0 ? (
          <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">
            No spans captured
          </div>
        ) : props.view === "timeline" ? (
          <SpanTimeline
            detail={props.detail}
            rows={rows}
            collapsed={props.collapsed}
            selectedSpanId={props.selectedSpanId}
            onCollapsedChange={props.onCollapsedChange}
            onSelectSpan={props.onSelectSpan}
          />
        ) : (
          <div className="h-full overflow-auto py-1" role="tree" aria-label="Span tree">
            {rows.map((row) => (
              <SpanTreeRow
                collapsed={props.collapsed.has(row.span.spanId)}
                key={row.span.spanId}
                row={row}
                selected={props.selectedSpanId === row.span.spanId}
                onSelect={() => props.onSelectSpan(row.span.spanId)}
                onToggle={() =>
                  toggleCollapsed(props.collapsed, row.span.spanId, props.onCollapsedChange)
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ViewModeSwitch(props: { value: TraceSpanView; onChange: (view: TraceSpanView) => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center rounded-md border bg-muted/50 p-0.5">
      {(
        [
          ["tree", ListTree],
          ["timeline", GanttChartSquare],
        ] as const
      ).map(([view, Icon]) => (
        <button
          aria-label={`${labelText(view)} view`}
          aria-pressed={props.value === view}
          className={cn(
            "flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-muted-foreground",
            props.value === view && "bg-background text-foreground shadow-sm",
          )}
          key={view}
          title={labelText(view)}
          type="button"
          onClick={() => props.onChange(view)}
        >
          <Icon className="size-3.5" />
          <span className="hidden xl:inline">{labelText(view)}</span>
        </button>
      ))}
    </div>
  );
}

function SearchResults(props: {
  results: SpanDetail[];
  selectedSpanId?: string;
  onSelectSpan: (id: string) => void;
  onClear: () => void;
}) {
  if (props.results.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="grid gap-3">
          <span className="text-sm font-medium">No matching spans</span>
          <span className="text-xs text-muted-foreground">
            Search by name, kind, service, model, or ID.
          </span>
          <Button size="sm" variant="outline" onClick={props.onClear}>
            Clear search
          </Button>
        </div>
      </div>
    );
  }
  return (
    <ul className="h-full overflow-auto py-1" aria-label="Span search results">
      {props.results.map((span) => (
        <li key={span.spanId}>
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60",
              props.selectedSpanId === span.spanId && "bg-muted",
            )}
            type="button"
            onClick={() => props.onSelectSpan(span.spanId)}
          >
            <ObservationGlyph kind={span.observationKind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{span.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {span.observationKind} · {span.serviceName}
              </span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatDuration(spanDurationMs(span))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function toggleCollapsed(current: Set<string>, id: string, onChange: (value: Set<string>) => void) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  onChange(next);
}

function SpanTreeRow(props: {
  row: FlatSpanNode;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const span = props.row.span;
  return (
    <div
      aria-level={props.row.depth + 1}
      aria-selected={props.selected}
      className={cn(
        "group flex min-w-0 items-stretch text-muted-foreground hover:bg-muted/60",
        props.selected && "bg-muted text-foreground",
      )}
      role="treeitem"
      tabIndex={-1}
    >
      <button
        className="flex min-w-0 flex-1 items-stretch text-left"
        type="button"
        onClick={props.onSelect}
      >
        <TreeIndent row={props.row} collapsed={props.collapsed} />
        <span className="grid min-w-0 flex-1 content-center py-1.5 pr-2">
          <span className="truncate text-xs font-medium text-current" title={span.name}>
            {span.name}
          </span>
          <span className="flex min-w-0 gap-1.5 overflow-hidden text-[11px] text-muted-foreground">
            <span className="truncate">{span.observationKind}</span>
            <span>·</span>
            <span className="truncate">{span.model ?? span.serviceName}</span>
          </span>
          <span className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
            <span>{formatDuration(spanDurationMs(span))}</span>
            {span.totalTokens > 0 ? <span>{formatNumber(span.totalTokens)} tok</span> : null}
            {span.totalCost !== null ? <span>{formatCost(span.totalCost)}</span> : null}
          </span>
        </span>
      </button>
      {props.row.hasChildren ? (
        <button
          aria-expanded={!props.collapsed}
          aria-label={props.collapsed ? `Expand ${span.name}` : `Collapse ${span.name}`}
          className="m-1 grid size-7 shrink-0 place-items-center rounded-md hover:bg-background"
          type="button"
          onClick={props.onToggle}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", !props.collapsed && "rotate-90")}
          />
        </button>
      ) : null}
    </div>
  );
}

function TreeIndent({ row, collapsed }: { row: FlatSpanNode; collapsed: boolean }) {
  const slot = 20;
  const iconX = row.depth * slot;
  return (
    <span
      className="relative shrink-0"
      data-tree-depth={row.depth}
      style={{ width: `${(row.depth + 1) * slot + 4}px` }}
    >
      {row.ancestorContinues
        .slice(0, -1)
        .map((continues, level) => ({
          continues,
          key: `${row.span.spanId}:ancestor:${level}`,
          left: level * slot + 10,
        }))
        .map((line) =>
          line.continues ? (
            <span
              className="absolute inset-y-0 w-px bg-border"
              data-tree-line="ancestor"
              key={line.key}
              style={{ left: `${line.left}px` }}
            />
          ) : null,
        )}
      {row.depth > 0 ? (
        <>
          <span
            className="absolute top-0 w-px bg-border"
            data-tree-line="branch"
            style={{
              left: `${(row.depth - 1) * slot + 10}px`,
              height: row.isLastSibling ? "50%" : "100%",
            }}
          />
          <span
            className="absolute top-1/2 h-px bg-border"
            data-tree-line="elbow"
            style={{ left: `${(row.depth - 1) * slot + 10}px`, width: `${slot}px` }}
          />
        </>
      ) : null}
      {row.hasChildren && !collapsed ? (
        <span
          className="absolute bottom-0 top-1/2 w-px bg-border"
          data-tree-line="children"
          style={{ left: `${iconX + 10}px` }}
        />
      ) : null}
      <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `${iconX + 2}px` }}>
        <ObservationGlyph kind={row.span.observationKind} status={row.span.status} />
      </span>
    </span>
  );
}

function SpanTimeline(props: {
  detail: TraceDetail;
  rows: FlatSpanNode[];
  collapsed: Set<string>;
  selectedSpanId?: string;
  onCollapsedChange: (value: Set<string>) => void;
  onSelectSpan: (id: string) => void;
}) {
  const bounds = useMemo(() => traceTimelineBounds(props.detail), [props.detail]);
  return (
    <section className="h-full overflow-auto" aria-label="Span timeline">
      <div className="min-w-max" style={{ width: `${240 + TIMELINE_WIDTH}px` }}>
        <div className="sticky top-0 z-20 grid h-8 grid-cols-[240px_720px] border-b bg-background text-[10px] text-muted-foreground">
          <div className="sticky left-0 z-30 flex items-center border-r bg-background px-3 font-medium uppercase tracking-wide">
            Span
          </div>
          <div className="relative">
            {[0, 0.25, 0.5, 0.75, 1].map((point) => (
              <span
                className="absolute inset-y-0 border-l pl-1 pt-1.5"
                key={point}
                style={{ left: `${point * TIMELINE_WIDTH}px` }}
              >
                {formatDuration(bounds.durationMs * point)}
              </span>
            ))}
          </div>
        </div>
        {props.rows.map((row) => {
          const position = spanTimelinePosition(row.span, bounds);
          const selected = props.selectedSpanId === row.span.spanId;
          const isCollapsed = props.collapsed.has(row.span.spanId);
          return (
            <div
              className={cn(
                "grid h-8 grid-cols-[240px_720px] border-b border-border/50 hover:bg-muted/40",
                selected && "bg-muted",
              )}
              key={row.span.spanId}
            >
              <div className="sticky left-0 z-10 flex min-w-0 items-stretch border-r bg-background/95">
                <button
                  className="flex min-w-0 flex-1 items-stretch text-left"
                  type="button"
                  onClick={() => props.onSelectSpan(row.span.spanId)}
                >
                  <TreeIndent row={row} collapsed={isCollapsed} />
                  <span className="min-w-0 flex-1 truncate py-2 pr-1 text-[11px] font-medium">
                    {row.span.name}
                  </span>
                </button>
                {row.hasChildren ? (
                  <button
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed ? `Expand ${row.span.name}` : `Collapse ${row.span.name}`
                    }
                    className="grid w-6 place-items-center"
                    type="button"
                    onClick={() =>
                      toggleCollapsed(props.collapsed, row.span.spanId, props.onCollapsedChange)
                    }
                  >
                    <ChevronRight
                      className={cn("size-3 transition-transform", !isCollapsed && "rotate-90")}
                    />
                  </button>
                ) : null}
              </div>
              <button
                className="relative text-left"
                title={`${row.span.name}: ${formatDuration(spanDurationMs(row.span))}`}
                type="button"
                onClick={() => props.onSelectSpan(row.span.spanId)}
              >
                <span
                  className={cn(
                    "absolute top-2 h-4 rounded-sm bg-primary/75",
                    row.span.status === "error" && "bg-destructive",
                    selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                  )}
                  data-timeline-bar={row.span.spanId}
                  style={{ left: `${position.left}px`, width: `${position.width}px` }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SpanInspector(props: {
  span: SpanDetail;
  payloadView: TracePayloadView;
  onPayloadViewChange: (view: TracePayloadView) => void;
}) {
  const span = props.span;
  const metadata = useMemo(
    () => ({
      trace: {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        traceState: span.traceState,
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.endTimeUnixNano,
        durationNano: span.durationNano,
      },
      instrumentation: {
        serviceName: span.serviceName,
        serviceVersion: span.serviceVersion,
        scopeName: span.scopeName,
        scopeVersion: span.scopeVersion,
        kind: span.kind,
        observationKind: span.observationKind,
        environment: span.environment,
        release: span.release,
        version: span.version,
      },
      resourceAttributes: span.resourceAttributes,
      spanAttributes: span.spanAttributes,
      events: span.events,
      links: span.links,
      ingestedAt: span.ingestedAt,
    }),
    [span],
  );
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Selected span data">
      <header className="shrink-0 border-b px-4 py-4 md:px-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ObservationGlyph kind={span.observationKind} status={span.status} size="large" />
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight">{span.name}</h2>
                <StatusPill status={span.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                {span.observationKind} · {formatNanoTimestamp(span.startTimeUnixNano)}
              </span>
            </div>
          </div>
          <PayloadViewSwitch value={props.payloadView} onChange={props.onPayloadViewChange} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <MetricPill
            icon={<Clock3 />}
            label="Duration"
            value={formatDuration(spanDurationMs(span))}
          />
          <MetricPill
            icon={<Braces />}
            label="Tokens"
            value={`${formatNumber(span.inputTokens)} in · ${formatNumber(span.outputTokens)} out`}
          />
          <MetricPill icon={<Database />} label="Cost" value={formatCost(span.totalCost)} />
          {span.model ? <MetricPill icon={<Sparkles />} label="Model" value={span.model} /> : null}
          <MetricPill icon={<Activity />} label="Service" value={span.serviceName} />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span title={span.spanId}>Span {span.spanId}</span>
          {span.parentSpanId ? (
            <span title={span.parentSpanId}>Parent {span.parentSpanId}</span>
          ) : null}
          {span.scopeName ? <span>Scope {span.scopeName}</span> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid content-start gap-6 p-4 md:p-6">
          <PayloadSection title="Input" value={span.input} view={props.payloadView} />
          <PayloadSection title="Output" value={span.output} view={props.payloadView} />
          {span.status === "error" || span.statusMessage ? (
            <section className="grid gap-2">
              <SectionTitle title="Error" />
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {span.statusMessage || "This span finished with an error."}
              </div>
            </section>
          ) : null}
          <PayloadSection title="Metadata" value={metadata} view={props.payloadView} />
        </div>
      </div>
    </section>
  );
}

function PayloadViewSwitch(props: {
  value: TracePayloadView;
  onChange: (view: TracePayloadView) => void;
}) {
  return (
    <fieldset
      className="flex h-8 items-center rounded-md border bg-muted/50 p-0.5"
      aria-label="Payload view"
    >
      {(["formatted", "json"] as const).map((view) => (
        <button
          aria-pressed={props.value === view}
          className={cn(
            "h-6 rounded px-2 text-xs font-medium text-muted-foreground",
            props.value === view && "bg-background text-foreground shadow-sm",
          )}
          key={view}
          type="button"
          onClick={() => props.onChange(view)}
        >
          {view === "formatted" ? "Formatted" : "JSON"}
        </button>
      ))}
    </fieldset>
  );
}

function MetricPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground [&_svg]:size-3.5">{props.icon}</span>
      <span className="text-muted-foreground">{props.label}</span>
      <span className="max-w-44 truncate font-mono font-medium">{props.value}</span>
    </div>
  );
}

function PayloadSection(props: {
  title: string;
  value: JsonValue | Record<string, unknown> | null;
  view: TracePayloadView;
}) {
  return (
    <section className="grid min-w-0 gap-3">
      <SectionTitle title={props.title} />
      {props.value === null || props.value === undefined ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No data captured
        </div>
      ) : props.view === "json" ? (
        <RawJsonBlock title={props.title} value={props.value} />
      ) : (
        <FormattedPayload title={props.title} value={props.value} />
      )}
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function FormattedPayload({ title, value }: { title: string; value: unknown }) {
  const rows = formattedPayloadRows(title, value);
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-4 text-sm text-muted-foreground">Empty value</div>
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <article
          className="grid min-w-0 gap-2 rounded-lg border bg-muted/10 px-4 py-3"
          key={row.key}
        >
          <div className="flex items-center gap-2">
            {row.role ? <RoleBadge role={row.role} /> : null}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </span>
          </div>
          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{row.text}</p>
        </article>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant={role === "tool" ? "destructive" : role === "assistant" ? "secondary" : "outline"}
    >
      {labelText(role)}
    </Badge>
  );
}

function RawJsonBlock({ title, value }: { title: string; value: unknown }) {
  const json = rawTraceJson(value);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-w-0 rounded-lg border bg-muted/20">
      <Button
        aria-label={`Copy ${title} JSON`}
        className="absolute right-2 top-2 z-10"
        size="icon-sm"
        title={copied ? "Copied" : "Copy JSON"}
        variant="secondary"
        onClick={() => {
          void navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <pre className="max-h-[32rem] overflow-auto p-4 pr-12 font-mono text-xs leading-5">
        {jsonSyntaxTokens(json).map((token) => (
          <span
            className={cn(
              token.type === "key" && "text-blue-600 dark:text-blue-400",
              token.type === "string" && "text-emerald-700 dark:text-emerald-400",
              token.type === "number" && "text-amber-700 dark:text-amber-400",
              token.type === "boolean" && "text-violet-700 dark:text-violet-400",
              token.type === "null" && "text-muted-foreground",
            )}
            key={token.start}
          >
            {token.text}
          </span>
        ))}
      </pre>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="grid max-w-sm gap-2">
        <CircleDot className="mx-auto size-8 text-muted-foreground" />
        <span className="text-sm font-medium">No span selected</span>
        <span className="text-xs text-muted-foreground">
          Select a span from the tree or timeline to inspect its data.
        </span>
      </div>
    </div>
  );
}

function ObservationGlyph(props: {
  kind: ObservationKind;
  status?: SpanDetail["status"];
  size?: "small" | "large";
}) {
  const Icon = observationIcon(props.kind);
  return (
    <span
      className={cn(
        "relative z-10 grid size-4 shrink-0 place-items-center rounded-sm bg-foreground text-background [&_svg]:size-2.5",
        props.kind === "generation" && "bg-blue-600 text-white",
        props.kind === "tool" && "bg-amber-600 text-white",
        (props.kind === "agent" || props.kind === "chain") && "bg-violet-600 text-white",
        props.status === "error" && "bg-destructive text-destructive-foreground",
        props.size === "large" && "size-9 rounded-lg [&_svg]:size-4",
      )}
    >
      <Icon />
    </span>
  );
}

function observationIcon(kind: ObservationKind) {
  if (kind === "generation" || kind === "embedding") return Sparkles;
  if (kind === "tool") return Wrench;
  if (kind === "agent" || kind === "chain") return Bot;
  if (kind === "evaluator" || kind === "guardrail") return ShieldCheck;
  if (kind === "event") return Activity;
  return CircleDot;
}

function StatusPill({ status }: { status: SpanDetail["status"] }) {
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {status === "ok" ? "Success" : status === "error" ? "Error" : "Unset"}
    </Badge>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
    value,
  );
}

function formatDuration(value: number): string {
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}

function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function formatNanoTimestamp(value: string): string {
  const date = new Date(nanoToMs(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
