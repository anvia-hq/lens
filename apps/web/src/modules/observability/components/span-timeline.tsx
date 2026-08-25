import type { TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { cn } from "@lens/ui/lib/utils";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import type { FlatSpanNode } from "../types";
import {
  formatDuration,
  spanDurationMs,
  spanTimelinePosition,
  TIMELINE_WIDTH,
  toggleCollapsed,
  traceTimelineBounds,
} from "../utils/trace-detail";
import { observeVirtualElementRect } from "../utils/virtualization";
import { TreeIndent } from "./tree-indent";

export function SpanTimeline(props: {
  detail: TraceDetail;
  rows: FlatSpanNode[];
  collapsed: Set<string>;
  selectedSpanId?: string;
  onCollapsedChange: (value: Set<string>) => void;
  onSelectSpan: (id: string) => void;
}) {
  const bounds = useMemo(() => traceTimelineBounds(props.detail), [props.detail]);
  const scrollRef = useRef<HTMLElement>(null);
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => props.rows[index]?.span.spanId ?? index,
    estimateSize: () => 32,
    initialRect: { width: 960, height: 600 },
    observeElementRect: observeVirtualElementRect,
    overscan: 10,
  });
  return (
    <section
      className="h-full overflow-auto overscroll-contain"
      aria-label="Span timeline"
      ref={scrollRef}
    >
      <div className="min-w-max" style={{ width: `${240 + TIMELINE_WIDTH}px` }}>
        <div className="sticky top-0 z-20 grid h-8 grid-cols-[240px_720px] border-b bg-background text-[10px] text-muted-foreground">
          <div className="sticky left-0 z-30 flex items-center border-r bg-background px-3 font-medium uppercase tracking-wide">
            Span
          </div>
          <div className="relative">
            {[0, 0.25, 0.5, 0.75, 1].map((point) => (
              <span
                className={cn(
                  "absolute inset-y-0 pt-1.5",
                  point === 0 && "left-0 pl-1",
                  point > 0 && point < 1 && "border-l pl-1",
                  point === 1 && "right-0 border-r pr-1 text-right",
                )}
                key={point}
                style={point > 0 && point < 1 ? { left: `${point * TIMELINE_WIDTH}px` } : undefined}
              >
                {formatDuration(bounds.durationMs * point)}
              </span>
            ))}
          </div>
        </div>
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = props.rows[virtualRow.index];
            if (!row) return null;
            const position = spanTimelinePosition(row.span, bounds);
            const selected = props.selectedSpanId === row.span.spanId;
            const isCollapsed = props.collapsed.has(row.span.spanId);
            return (
              <div
                className={cn(
                  "group/timeline absolute left-0 top-0 grid h-8 w-full grid-cols-[240px_720px] border-b border-border/50",
                  selected
                    ? "border-border-strong bg-row-active"
                    : "hover:border-border-strong hover:bg-muted",
                )}
                key={row.span.spanId}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div
                  className={cn(
                    "sticky left-0 z-10 flex min-w-0 items-stretch border-r px-2",
                    selected ? "bg-row-active" : "bg-background/95 group-hover/timeline:bg-muted",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-stretch text-left"
                    disabled={row.provisional}
                    title={
                      row.provisional
                        ? "The root span will be available when the trace finishes"
                        : undefined
                    }
                    type="button"
                    onClick={() => props.onSelectSpan(row.span.spanId)}
                  >
                    <TreeIndent row={row} collapsed={isCollapsed} />
                    <span className="min-w-0 flex-1 truncate py-2 pr-1 text-[11px] font-medium">
                      {row.span.name}
                    </span>
                    {row.provisional ? (
                      <Badge
                        className="my-auto h-4 shrink-0 px-1 text-[9px] leading-none"
                        variant="secondary"
                      >
                        RUNNING
                      </Badge>
                    ) : row.span.status === "error" ? (
                      <Badge
                        className="my-auto h-4 shrink-0 px-1 text-[9px] leading-none"
                        variant="destructive"
                      >
                        ERROR
                      </Badge>
                    ) : null}
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
                  disabled={row.provisional}
                  title={`${row.span.name}: ${formatDuration(spanDurationMs(row.span))}`}
                  type="button"
                  onClick={() => props.onSelectSpan(row.span.spanId)}
                >
                  <span
                    className={cn(
                      "absolute top-2 h-4 rounded-sm bg-muted-foreground/25",
                      row.span.status === "error" && "bg-status-error/50",
                      selected && "bg-viz-indigo",
                    )}
                    data-timeline-bar={row.span.spanId}
                    style={{ left: `${position.left}px`, width: `${position.width}px` }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
