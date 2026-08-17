import { Badge } from "@lens/ui/components/badge";
import type { ReactNode } from "react";

export type SemanticStatusTone = "success" | "error" | "warning" | "neutral";

export function SemanticStatusBadge(props: { tone: SemanticStatusTone; children: ReactNode }) {
  const className =
    props.tone === "success"
      ? "border-0 bg-emerald-200 text-emerald-950 dark:bg-emerald-300 dark:text-emerald-950"
      : props.tone === "error"
        ? "border-0 bg-rose-200 text-rose-950 dark:bg-rose-300 dark:text-rose-950"
        : props.tone === "warning"
          ? "border-0 bg-amber-200 text-amber-950 dark:bg-amber-300 dark:text-amber-950"
          : "border-0 bg-slate-200 text-slate-900 dark:bg-slate-300 dark:text-slate-950";

  return (
    <Badge variant="default" className={className}>
      {props.children}
    </Badge>
  );
}
