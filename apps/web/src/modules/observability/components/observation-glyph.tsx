import type { ObservationKind, TraceStatus } from "@lens/contracts";
import { cn } from "@lens/ui/lib/utils";
import { observationIcon } from "../utils/observation-icon";

export function ObservationGlyph(props: {
  kind: ObservationKind;
  status?: TraceStatus;
  size?: "small" | "large";
}) {
  const Icon = observationIcon(props.kind);
  return (
    <span
      className={cn(
        "relative z-10 grid size-4 shrink-0 place-items-center rounded-sm bg-foreground text-background [&_svg]:size-2.5",
        props.kind === "generation" && "bg-blue-600 text-white",
        props.kind === "tool" && "bg-amber-600 text-white",
        (props.kind === "agent" || props.kind === "chain") && "bg-violet-600 text-white",
        props.status === "error" && "bg-destructive text-destructive-foreground",
        props.size === "large" && "size-9 rounded-lg [&_svg]:size-4",
      )}
    >
      <Icon />
    </span>
  );
}
