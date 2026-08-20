import type { TraceDetail } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Input } from "@lens/ui/components/input";
import {
  TreeStructure as ListTree,
  MagnifyingGlass as Search,
  ArrowsOutLineVertical as UnfoldVertical,
} from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { lazy, Suspense, useMemo, useRef } from "react";
import type { SpanTreeNode, TraceSpanView } from "../types";
import { flattenSpanForest, searchTraceSpans, toggleCollapsed } from "../utils/trace-detail";
import { observeVirtualElementRect } from "../utils/virtualization";
import { SearchResults } from "./search-results";
import { SpanTimeline } from "./span-timeline";
import { SpanTreeRow } from "./span-tree-row";
import { ViewModeSwitch } from "./view-mode-switch";

const TraceGraph = lazy(() => import("./trace-graph"));

export function TraceNavigator(props: {
  collapsed: Set<string>;
  detail: TraceDetail;
  forest: SpanTreeNode[];
  allowGraph?: boolean;
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
  const treeRef = useRef<HTMLDivElement>(null);
  const treeVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => treeRef.current,
    getItemKey: (index) => rows[index]?.span.spanId ?? index,
    estimateSize: () => 44,
    initialRect: { width: 600, height: 600 },
    observeElementRect: observeVirtualElementRect,
    overscan: 10,
  });

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Trace spans">
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
        {props.view === "graph" ? null : (
          <Button
            aria-label={everythingCollapsed ? "Expand all spans" : "Collapse all spans"}
            title={everythingCollapsed ? "Expand all" : "Collapse all"}
            size="icon-sm"
            variant="ghost"
            onClick={toggleAll}
          >
            {everythingCollapsed ? <UnfoldVertical /> : <ListTree />}
          </Button>
        )}
        {props.hideModeSwitch ? null : (
          <ViewModeSwitch
            allowGraph={props.allowGraph}
            value={props.view}
            onChange={props.onViewChange}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.view === "graph" ? (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Loading graph…
              </div>
            }
          >
            <TraceGraph
              search={props.search}
              selectedSpanId={props.selectedSpanId}
              spans={props.detail.spans}
              onSelectSpan={props.onSelectSpan}
            />
          </Suspense>
        ) : props.search.trim().length > 0 ? (
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
          <div
            className="h-full overflow-auto overscroll-contain px-2 py-1"
            ref={treeRef}
            role="tree"
            aria-label="Span tree"
          >
            <div className="relative w-full" style={{ height: treeVirtualizer.getTotalSize() }}>
              {treeVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                  <div
                    className="absolute left-0 top-0 w-full"
                    key={row.span.spanId}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <SpanTreeRow
                      collapsed={props.collapsed.has(row.span.spanId)}
                      row={row}
                      selected={props.selectedSpanId === row.span.spanId}
                      onSelect={() => props.onSelectSpan(row.span.spanId)}
                      onToggle={() =>
                        toggleCollapsed(props.collapsed, row.span.spanId, props.onCollapsedChange)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
