import type { SpanDetail, TraceDetail, TraceSummary } from "@lens/contracts";
import { Button, buttonVariants } from "@lens/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import { Spinner } from "@lens/ui/components/spinner";
import { ArrowDown, ArrowUp, ExternalLink } from "@mynaui/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import type { TraceSpanView } from "../types";
import {
  buildTraceSpanForest,
  formatCost,
  formatDuration,
  formatNumber,
  resolveSelectedSpan,
} from "../utils/trace-detail";
import { SpanInspectorState } from "./span-inspector-state";
import { StatusPill } from "./status-pill";
import { TraceNavigator } from "./trace-navigator";

export function TracePeekDrawer(props: {
  projectId: string;
  traces: TraceSummary[];
  selectedTraceId: string | null;
  onSelectTrace: (traceId: string | null) => void;
}) {
  const open = props.selectedTraceId !== null;
  const currentIndex = props.selectedTraceId
    ? props.traces.findIndex((item) => item.traceId === props.selectedTraceId)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < props.traces.length - 1;

  const [view, setView] = useState<TraceSpanView>("trajectory");
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSelectedSpanId(undefined);
    setCollapsed(new Set());
    setSearch("");
  }, [props.selectedTraceId]);

  const trace = useQuery({
    queryKey: ["trace", props.projectId, props.selectedTraceId],
    queryFn: ({ signal }) =>
      api<TraceDetail>(`/api/v1/projects/${props.projectId}/traces/${props.selectedTraceId}`, {
        signal,
      }),
    enabled: props.selectedTraceId !== null,
    staleTime: 60_000,
  });

  const detail = trace.data;
  const forest = useMemo(() => (detail ? buildTraceSpanForest(detail) : []), [detail]);
  const resolvedSpan = detail ? resolveSelectedSpan(detail.spans, selectedSpanId) : undefined;

  const span = useQuery({
    queryKey: ["trace-span", props.projectId, props.selectedTraceId, resolvedSpan?.spanId],
    queryFn: ({ signal }) =>
      api<SpanDetail>(
        `/api/v1/projects/${props.projectId}/traces/${props.selectedTraceId}/spans/${resolvedSpan?.spanId}`,
        { signal },
      ),
    enabled: props.selectedTraceId !== null && resolvedSpan !== undefined,
    staleTime: 5 * 60 * 1_000,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "ArrowUp" && hasPrev) {
        event.preventDefault();
        const prev = props.traces[currentIndex - 1];
        if (prev) props.onSelectTrace(prev.traceId);
      } else if (event.key === "ArrowDown" && hasNext) {
        event.preventDefault();
        const next = props.traces[currentIndex + 1];
        if (next) props.onSelectTrace(next.traceId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, hasNext, hasPrev, open, props]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && props.onSelectTrace(null)}>
      <SheetContent
        side="right"
        className="flex w-[min(72rem,95vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">Trace preview</SheetTitle>
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 pr-12">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous trace"
              disabled={!hasPrev}
              onClick={() => {
                const prev = props.traces[currentIndex - 1];
                if (prev) props.onSelectTrace(prev.traceId);
              }}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next trace"
              disabled={!hasNext}
              onClick={() => {
                const next = props.traces[currentIndex + 1];
                if (next) props.onSelectTrace(next.traceId);
              }}
            >
              <ArrowDown />
            </Button>
            {detail ? (
              <div className="ml-1 flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold">{detail.summary.name}</span>
                <StatusPill status={detail.summary.status} />
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {formatDuration(detail.summary.durationMs)} ·{" "}
                  {formatNumber(detail.summary.totalTokens)} tok ·{" "}
                  {formatCost(detail.summary.totalCost)}
                </span>
              </div>
            ) : null}
          </div>
          {props.selectedTraceId ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to="/$projectId/traces/$traceId"
              params={{ projectId: props.projectId, traceId: props.selectedTraceId }}
              search={{ view, span: resolvedSpan?.spanId }}
            >
              Open full page <ExternalLink />
            </Link>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {trace.isLoading ? (
            <div className="grid h-full place-items-center text-base text-muted-foreground">
              <span className="flex items-center gap-2">
                <Spinner /> Loading trace
              </span>
            </div>
          ) : detail ? (
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 overflow-hidden">
              <ResizablePanel defaultSize="46" minSize="30" className="min-h-0 overflow-hidden">
                <TraceNavigator
                  allowGraph={false}
                  collapsed={collapsed}
                  detail={detail}
                  forest={forest}
                  projectId={props.projectId}
                  search={search}
                  selectedSpanId={resolvedSpan?.spanId}
                  view={view}
                  onCollapsedChange={setCollapsed}
                  onSearchChange={setSearch}
                  onSelectSpan={setSelectedSpanId}
                  onViewChange={setView}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="54" minSize="35" className="min-h-0 overflow-hidden">
                <SpanInspectorState
                  error={span.error}
                  loading={span.isLoading}
                  selectedSpanId={resolvedSpan?.spanId}
                  span={span.data}
                  onRetry={() => void span.refetch()}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="grid h-full place-items-center text-base text-muted-foreground">
              Trace not found
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
