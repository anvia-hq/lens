import { cn } from "@lens/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A row on the trajectory rail. The connector line is drawn per row (half-height on the first
 * and last rows) so the rail reads as one continuous line through the markers, and it paints
 * above the row's hover/selected fill but below the marker.
 */
export function RailRow(props: {
  marker: ReactNode;
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <li className="relative">
      {/* Mouse convenience: the whole row selects. Keyboard users reach the row's own button. */}
      <div
        className={cn(
          "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 rounded-md px-2 py-1.5 transition-colors",
          props.onSelect && "cursor-pointer hover:bg-row-hover",
          props.selected && "bg-row-active hover:bg-row-active",
        )}
        onClick={props.onSelect}
      >
        <span className="relative z-10 flex h-5 items-center justify-center">{props.marker}</span>
        <div className="min-w-0">{props.children}</div>
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-4.5 w-px -translate-x-1/2 bg-border",
          props.first ? "top-4" : "top-0",
          props.last ? "h-4" : "bottom-0",
          props.first && props.last && "hidden",
        )}
      />
    </li>
  );
}

export function RailDot() {
  return <span className="size-1.5 rounded-full bg-border-strong" />;
}

export function RailIcon(props: { children: ReactNode }) {
  return (
    <span className="grid size-4 place-items-center rounded-sm bg-muted text-muted-foreground ring-1 ring-border [&_svg]:size-2.5">
      {props.children}
    </span>
  );
}
