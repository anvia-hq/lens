import { cn } from "@lens/ui/lib/utils";
import {
  ChartBarHorizontal as GanttChartSquare,
  TreeStructure as ListTree,
} from "@phosphor-icons/react";
import type { TraceSpanView } from "../types";
import { labelText } from "../utils/trace-detail";

export function ViewModeSwitch(props: {
  value: TraceSpanView;
  onChange: (view: TraceSpanView) => void;
}) {
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
