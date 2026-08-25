import type { ObservationKind, TraceStatus } from "@lens/contracts";
import { cn } from "@lens/ui/lib/utils";
import { observationIcon } from "../utils/observation-icon";

export function ObservationGlyph(props: {
  kind: ObservationKind;
  status?: TraceStatus;
  size?: "small" | "large";
}) {
  const Icon = observationIcon(props.kind);
  const tone =
    props.status === "error"
      ? "bg-status-error text-destructive-foreground"
      : observationTone(props.kind);
  return (
    <span
      className={cn(
        "relative z-10 grid size-4 shrink-0 place-items-center rounded-sm [&_svg]:size-2.5",
        tone,
        props.size === "large" && "size-9 rounded-lg [&_svg]:size-4",
      )}
    >
      <Icon />
    </span>
  );
}

function observationTone(kind: ObservationKind): string {
  if (kind === "generation") return "bg-observation-generation text-observation-foreground";
  if (kind === "tool") return "bg-observation-tool text-observation-foreground";
  if (kind === "agent" || kind === "chain")
    return "bg-observation-agent text-observation-foreground";
  return "bg-foreground text-background";
}
