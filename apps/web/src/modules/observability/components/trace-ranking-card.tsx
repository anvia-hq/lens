import type { TraceSummary } from "@lens/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { formatNumber, relativeTime } from "../utils/observability-view";
import { ObservationIcon } from "./observation-icon";

export function TraceRankingCard(props: {
  title: string;
  description: string;
  traces: TraceSummary[];
  projectId: string;
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {props.traces.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {props.emptyText ?? "No traces in this window."}
          </p>
        ) : (
          props.traces.map((trace) => (
            <Link
              key={trace.traceId}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-row-hover hover:text-foreground"
              to="/$projectId/traces/$traceId"
              params={{ projectId: props.projectId, traceId: trace.traceId }}
            >
              <ObservationIcon kind={trace.generationCount > 0 ? "generation" : "span"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{trace.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {trace.model ?? trace.serviceName} · {relativeTime(trace.startedAt)}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm">{formatNumber(trace.totalTokens)}</span>
                <span className="block text-xs text-muted-foreground">tokens</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
