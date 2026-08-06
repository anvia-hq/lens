import type { ReactNode } from "react";

export function MetricPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground [&_svg]:size-3.5">{props.icon}</span>
      <span className="text-muted-foreground">{props.label}</span>
      <span className="max-w-44 truncate font-mono font-medium">{props.value}</span>
    </div>
  );
}
