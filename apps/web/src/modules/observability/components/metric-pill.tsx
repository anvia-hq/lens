import type { ReactNode } from "react";

export function MetricPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded border bg-muted/20 px-2 py-0.5 text-xs">
      <span className="text-muted-foreground [&_svg]:size-3">{props.icon}</span>
      <span className="text-muted-foreground">{props.label}</span>
      <span className="max-w-44 truncate font-mono font-medium">{props.value}</span>
    </div>
  );
}
