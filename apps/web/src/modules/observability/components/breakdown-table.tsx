import { Card, CardContent } from "@lens/ui/components/card";
import { TableHead } from "@lens/ui/components/table";
import { cn } from "@lens/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { formatPercent } from "../utils/observability-view";

export function BreakdownCard(props: { className?: string; children: ReactNode }) {
  return (
    <Card size="sm" className={cn("gap-0 py-0", props.className)}>
      <CardContent className="overflow-x-auto px-0">{props.children}</CardContent>
    </Card>
  );
}

/** First header cell: the card title doubles as the first column label. */
export function TitleTh(props: { title: string; description: string }) {
  return (
    <Th
      className="h-9 text-xs font-medium tracking-normal text-foreground normal-case"
      title={props.description}
    >
      {props.title}
    </Th>
  );
}

export function Th({ className, ...props }: ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      className={cn(
        "h-7 text-xs font-medium tracking-wide text-muted-foreground uppercase first:pl-(--card-spacing) last:pr-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export const cellClass =
  "py-1 first:pl-(--card-spacing) last:pr-(--card-spacing) text-right font-mono tabular-nums";

export function ErrorRate({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1.5",
        value > 0 ? "text-status-error" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", value > 0 ? "bg-status-error" : "bg-border-strong")}
      />
      {formatPercent(value)}
    </span>
  );
}

export function ShareBar(props: { value: number; label?: string }) {
  const width = `${Math.min(100, Math.max(0, props.value * 100))}%`;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-viz-indigo" style={{ width }} />
      </span>
      <span className="w-11 text-right">{props.label ?? formatPercent(props.value)}</span>
    </span>
  );
}
