import { Badge } from "@lens/ui/components/badge";
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
        "group flex h-11 min-w-0 items-stretch border-l-2 border-transparent text-muted-foreground",
        props.selected
          ? "border-l-viz-indigo bg-row-active text-foreground"
          : "hover:bg-muted hover:text-foreground",
      )}
      role="treeitem"
      tabIndex={-1}
    >
      <button
        className="flex min-w-0 flex-1 items-stretch text-left disabled:cursor-default"
        disabled={props.row.provisional}
        title={
          props.row.provisional
            ? "The root span will be available when the trace finishes"
            : undefined
        }
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
        {props.row.provisional ? (
          <Badge
            className="my-auto mr-1 h-4 shrink-0 px-1 text-[9px] leading-none"
            variant="secondary"
          >
            RUNNING
          </Badge>
        ) : span.status === "error" ? (
          <Badge
            className="my-auto mr-1 h-4 shrink-0 px-1 text-[9px] leading-none"
            variant="destructive"
          >
            ERROR
          </Badge>
        ) : null}
      </button>
      {props.row.hasChildren ? (
        <button
          aria-expanded={!props.collapsed}
          aria-label={props.collapsed ? `Expand ${span.name}` : `Collapse ${span.name}`}
          className="m-1 grid size-7 shrink-0 place-items-center rounded-md hover:bg-control-hover"
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
