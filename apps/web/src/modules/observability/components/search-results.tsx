import type { TraceSpanSummary } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { formatDuration, spanDurationMs } from "../utils/trace-detail";
import { observeVirtualElementRect } from "../utils/virtualization";
import { ObservationGlyph } from "./observation-glyph";

export function SearchResults(props: {
  results: TraceSpanSummary[];
  selectedSpanId?: string;
  onSelectSpan: (id: string) => void;
  onClear: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: props.results.length,
    getScrollElement: () => listRef.current,
    getItemKey: (index) => props.results[index]?.spanId ?? index,
    estimateSize: () => 52,
    initialRect: { width: 600, height: 600 },
    observeElementRect: observeVirtualElementRect,
    overscan: 10,
  });
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
    <div className="h-full overflow-auto overscroll-contain py-1" ref={listRef}>
      <ul
        aria-label="Span search results"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const span = props.results[virtualRow.index];
          if (!span) return null;
          return (
            <li
              className="absolute left-0 top-0 w-full"
              key={span.spanId}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
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
          );
        })}
      </ul>
    </div>
  );
}
