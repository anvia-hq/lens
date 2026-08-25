import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@lens/ui/components/card";
import { cn } from "@lens/ui/lib/utils";
import type { ReactNode } from "react";
import { comparisonDelta } from "../utils";

export function ComparisonMetricCard(props: {
  label: string;
  value: string;
  current: number;
  previous: number;
  icon: ReactNode;
  deltaMode?: "relative" | "points";
  lowerIsBetter?: boolean;
}) {
  const delta = comparisonDelta(props.current, props.previous, props.deltaMode ?? "relative");
  const improved =
    delta.hasPreviousPeriodComparison && props.lowerIsBetter && delta.direction !== "flat"
      ? delta.direction === "down"
      : false;
  const worsened =
    delta.hasPreviousPeriodComparison && props.lowerIsBetter && delta.direction !== "flat"
      ? delta.direction === "up"
      : false;
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardAction>
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
            {props.icon}
          </span>
        </CardAction>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
        <p
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            improved && "text-status-success",
            worsened && "text-destructive",
          )}
        >
          <span aria-hidden="true">{delta.label}</span>
          {delta.hasPreviousPeriodComparison ? (
            <>
              {" "}
              <span className="text-muted-foreground" aria-hidden="true">
                vs previous period
              </span>
            </>
          ) : null}
          <span className="sr-only">
            {delta.accessibleLabel}
            {delta.hasPreviousPeriodComparison ? " compared with the previous period" : ""}
          </span>
        </p>
      </CardHeader>
    </Card>
  );
}
