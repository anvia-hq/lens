import type { TraceDetail } from "@lens/contracts";
import { cn } from "@lens/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import type { FlatSpanNode } from "../types";
import {
  formatDuration,
  spanDurationMs,
  spanTimelinePosition,
  TIMELINE_WIDTH,
  toggleCollapsed,
  traceTimelineBounds,
} from "../utils/trace-detail";
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
  return (
    <section className="h-full overflow-auto overscroll-contain px-2" aria-label="Span timeline">
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
                    "absolute top-2 h-4 rounded-sm bg-muted-foreground/25",
                    row.span.status === "error" && "bg-destructive/50",
                    selected && "bg-blue-500/70",
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
