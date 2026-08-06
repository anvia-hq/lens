import { cn } from "@lens/ui/lib/utils";
import type { TracePayloadView } from "../types";

export function PayloadViewSwitch(props: {
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
