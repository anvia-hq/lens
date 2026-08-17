import { cn } from "@lens/ui/lib/utils";
import type { CSSProperties } from "react";
import { formatCost, formatDuration, formatNumber } from "../utils/trace-detail";
import type { TraceGraphNode as TraceGraphNodeModel } from "../utils/trace-graph";
import { ObservationGlyph } from "./observation-glyph";

export function TraceGraphNode(props: {
  node: TraceGraphNodeModel;
  selected: boolean;
  dimmed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  onSelect: () => void;
}) {
  const style: CSSProperties = {
    left: props.x,
    top: props.y,
    width: props.width,
    height: props.height,
  };

  if (props.node.spanId === undefined) {
    return (
      <div
        className={cn(
          "absolute grid place-items-center rounded-full border bg-muted px-3 text-xs font-semibold text-muted-foreground shadow-sm transition-opacity",
          props.dimmed && "opacity-25",
        )}
        data-graph-node={props.node.id}
        style={style}
      >
        {props.node.label}
      </div>
    );
  }

  const metrics = [
    formatDuration(props.node.durationMs),
    props.node.totalTokens > 0 ? `${formatNumber(props.node.totalTokens)} tok` : null,
    props.node.totalCost !== null ? formatCost(props.node.totalCost) : null,
  ].filter((value): value is string => value !== null);

  return (
    <button
      aria-label={`${props.node.label}, ${props.node.kind}, ${props.node.status}`}
      aria-pressed={props.selected}
      className={cn(
        "absolute grid grid-cols-[auto_minmax(0,1fr)] content-center gap-x-2 rounded-lg border bg-background px-3 text-left shadow-sm transition-[border-color,box-shadow,opacity] hover:border-foreground/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.node.status === "error" && "border-destructive/50",
        props.selected && "border-primary ring-2 ring-primary/25 shadow-md",
        props.dimmed && "opacity-20",
      )}
      data-graph-node={props.node.id}
      style={style}
      type="button"
      onClick={props.onSelect}
    >
      <ObservationGlyph
        kind={props.node.kind === "system" ? "span" : props.node.kind}
        status={props.node.status}
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold" title={props.node.label}>
          {props.node.label}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap gap-x-2 truncate font-mono text-[10px] text-muted-foreground">
          {metrics.map((metric) => (
            <span key={metric}>{metric}</span>
          ))}
        </span>
      </span>
    </button>
  );
}
