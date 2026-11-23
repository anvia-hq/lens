import type { TraceSummary } from "@lens/contracts";
import { Card } from "@lens/ui/components/card";
import { cn } from "@lens/ui/lib/utils";
import { ChevronRight } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { formatNumber, relativeTime } from "../utils/observability-view";

export function TraceRankingCard(props: {
  title: string;
  description: string;
  traces: TraceSummary[];
  projectId: string;
  emptyText?: string;
  tone?: "default" | "error";
}) {
  const maxTokens = Math.max(1, ...props.traces.map((trace) => trace.totalTokens));
  const isError = props.tone === "error";
  return (
    <Card size="sm" className="gap-0 py-0">
      <header className="flex h-9 items-baseline gap-2 border-b px-(--card-spacing) pt-2.5">
        <h3 className="font-heading text-xs font-medium">{props.title}</h3>
        <p className="min-w-0 truncate text-xs text-muted-foreground">{props.description}</p>
      </header>
      {props.traces.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {props.emptyText ?? "No traces in this window."}
        </p>
      ) : (
        <ol className="divide-y">
          {props.traces.map((trace, index) => (
            <li key={trace.traceId}>
              <Link
                className="group/row flex items-center gap-2.5 px-(--card-spacing) py-1.5 transition-colors hover:bg-row-hover"
                to="/$projectId/traces/$traceId"
                params={{ projectId: props.projectId, traceId: trace.traceId }}
              >
                <span className="w-3 shrink-0 text-right font-mono text-[0.7rem] text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{trace.name}</span>
                  <span className="block truncate text-[0.7rem] text-muted-foreground">
                    {trace.model ?? trace.serviceName} · {relativeTime(trace.startedAt)}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="hidden h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:block"
                >
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      isError ? "bg-status-error" : "bg-viz-indigo",
                    )}
                    style={{ width: `${(trace.totalTokens / maxTokens) * 100}%` }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">
                  {formatNumber(trace.totalTokens)}
                  <span className="ml-1 font-sans text-[0.7rem] text-muted-foreground">tok</span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/row:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
