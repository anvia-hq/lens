import { Badge } from "@lens/ui/components/badge";
import type { ReactNode } from "react";

export type SemanticStatusTone = "success" | "error" | "warning" | "neutral";

export function SemanticStatusBadge(props: { tone: SemanticStatusTone; children: ReactNode }) {
  const className =
    props.tone === "success"
      ? "border-0 bg-status-success-soft text-status-success"
      : props.tone === "error"
        ? "border-0 bg-status-error-soft text-status-error"
        : props.tone === "warning"
          ? "border-0 bg-status-warning-soft text-status-warning"
          : "border-0 bg-muted text-muted-foreground";

  return (
    <Badge variant="default" className={className}>
      {props.children}
    </Badge>
  );
}
