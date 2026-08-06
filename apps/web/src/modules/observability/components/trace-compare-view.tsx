import { buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { Pulse as Activity, ArrowLeft, ArrowsLeftRight } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import type { TraceCompareState } from "../hooks/use-trace-compare";
import { TraceComparePanel } from "./trace-compare-panel";

export function TraceCompareView({ state }: { state: TraceCompareState }) {
  if (state.traceIds.length < 2) {
    return (
      <main className="flex min-h-0 w-full flex-1 items-center justify-center overflow-auto p-4">
        <EmptyState
          icon={<ArrowsLeftRight />}
          title="Select at least two traces"
          text="Choose between two and four traces from the trace explorer to compare them."
          action={
            <Link
              className={buttonVariants({ variant: "outline" })}
              params={{ projectId: state.project.id }}
              search={{ range: "24h" }}
              to="/$projectId/traces"
            >
              <ArrowLeft /> Back to traces
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Compare traces</h1>
          <p className="text-xs text-muted-foreground">{state.traceIds.length} traces selected</p>
        </div>
        <Link
          className={buttonVariants({ variant: "outline", size: "sm" })}
          params={{ projectId: state.project.id }}
          search={{ range: "24h" }}
          to="/$projectId/traces"
        >
          <ArrowLeft /> Back to traces
        </Link>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 auto-rows-[minmax(32rem,auto)] gap-3 overflow-auto p-3 md:grid-cols-2 md:auto-rows-auto md:overflow-hidden",
          state.traceIds.length > 2 ? "md:grid-rows-2" : "md:grid-rows-1",
        )}
      >
        {state.traceIds.map((traceId, index) => {
          const trace = state.traces[index];
          if (trace?.data !== undefined) {
            return (
              <TraceComparePanel key={traceId} detail={trace.data} projectId={state.project.id} />
            );
          }
          return (
            <section
              className="grid min-h-0 place-items-center rounded-lg border bg-background p-4"
              key={traceId}
            >
              {trace?.isError ? (
                <div className="grid w-full max-w-lg gap-2">
                  <p className="truncate font-mono text-xs text-muted-foreground" title={traceId}>
                    {traceId}
                  </p>
                  <ErrorAlert error={trace.error} />
                </div>
              ) : (
                <div className="grid justify-items-center gap-3 text-muted-foreground">
                  <Activity className="animate-pulse" />
                  <p className="text-sm">Loading trace</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
