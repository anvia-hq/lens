import { Badge } from "@lens/ui/components/badge";
import type { ReactNode } from "react";

export type SemanticStatusTone = "success" | "error" | "warning" | "neutral";

export function SemanticStatusBadge(props: { tone: SemanticStatusTone; children: ReactNode }) {
  const className =
    props.tone === "success"
      ? "border-0 bg-status-success-fill-foreground text-status-success-fill"
      : props.tone === "error"
        ? "border-0 bg-status-error-fill-foreground text-status-error-fill"
        : props.tone === "warning"
          ? "border-0 bg-status-warning-fill text-status-warning-fill-foreground"
          : "border-0 bg-status-neutral-fill text-status-neutral-fill-foreground";

  return (
    <Badge variant="default" className={className}>
      {props.children}
    </Badge>
  );
}
