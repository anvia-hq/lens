import { cn } from "@lens/ui/lib/utils";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";
import type { FlatSpanNode } from "../types";
import { formatCost, formatDuration, formatNumber, spanDurationMs } from "../utils/trace-detail";
import { TreeIndent } from "./tree-indent";

export function SpanTreeRow(props: {
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
