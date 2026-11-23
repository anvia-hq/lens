import type { SessionDetail, SpanDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button, buttonVariants } from "@lens/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { cn } from "@lens/ui/lib/utils";
import { Activity, ExternalLink, GitBranch as ListTree, Trash } from "@mynaui/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/session";
import { buildSpanForest, flattenSpanForest, toggleCollapsed } from "../utils/trace-detail";
import { buildTrajectoryTurn } from "../utils/trajectory";
import { DataDeletionDialog } from "./data-deletion-dialog";
import { SessionMetadata } from "./session-metadata";
import { SpanInspectorState } from "./span-inspector-state";
import { SpanTreeRow } from "./span-tree-row";
import { StatusPill } from "./status-pill";
import { TrajectoryView } from "./trajectory-view";

type ThreadViewMode = "trajectory" | "traces";
type RightPanelTab = "details" | "step";

export function SessionConversation(props: {
  detail: SessionDetail;
  projectId: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onDelete?: () => void;
  deletionPending?: boolean;
}) {
  const summary = props.detail.summary;
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ThreadViewMode>("trajectory");
  const [rightTab, setRightTab] = useState<RightPanelTab>("details");
  const [selectedSpan, setSelectedSpan] = useState<{ traceId: string; spanId: string } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);

  const trajectoryTurns = useMemo(() => {
    if (props.detail.turns.length > 0) {
      return props.detail.turns.map((turn) =>
        buildTrajectoryTurn({
          trace: turn.trace,
          spans: turn.spans ?? [],
          prompt: turn.prompt,
          response: turn.response,
        }),
      );
    }
    return props.detail.traces.map((trace) =>
      buildTrajectoryTurn({ trace, spans: [], prompt: null, response: null }),
    );
  }, [props.detail.traces, props.detail.turns]);

  const handleSelectSpan = (traceId: string, spanId: string) => {
    setSelectedSpan({ traceId, spanId });
    setRightTab("step");
  };

  const leftPane = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold">Thread</h2>
            <p className="text-xs text-muted-foreground">
              {formatNumber(trajectoryTurns.length)}{" "}
              {trajectoryTurns.length === 1 ? "turn" : "turns"}
            </p>
          </div>
          <div className="flex h-8 items-center rounded-md border bg-muted/50 p-0.5">
            {(
              [
                ["trajectory", "Trajectory", Activity],
                ["traces", "Traces", ListTree],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                className={cn(
                  "flex h-6 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground",
                  viewMode === mode && "bg-background text-foreground shadow-sm",
                )}
                onClick={() => setViewMode(mode)}
              >
                <Icon className="size-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{formatNumber(summary.traceCount)} traces</Badge>
          {props.onDelete ? (
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash /> Delete
            </Button>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {viewMode === "trajectory" ? (
          <div className="mx-auto w-full max-w-5xl">
            <TrajectoryView
              mode="thread"
              projectId={props.projectId}
              turns={trajectoryTurns}
              selectedTraceId={selectedSpan?.traceId}
              selectedSpanId={selectedSpan?.spanId}
              onSelectSpan={handleSelectSpan}
              hasMore={props.hasMore}
              isLoadingMore={props.isLoadingMore}
              onLoadMore={props.onLoadMore}
            />
          </div>
        ) : (
          <div className="divide-y">
            {trajectoryTurns.length === 0 ? (
              <div className="grid min-h-64 place-items-center p-8 text-sm text-muted-foreground">
                No traces in this thread
              </div>
            ) : (
              trajectoryTurns.map((turn, index) => {
                const forest = buildSpanForest(turn.allSpans);
                const rows = flattenSpanForest(forest, collapsed);
                return (
                  <section key={turn.trace.traceId} className="px-4 py-4 md:px-6">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Trace {index + 1}
                          </span>
                          <StatusPill status={turn.trace.status} />
                          <span className="truncate text-sm font-medium">{turn.trace.name}</span>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {formatTimestamp(turn.trace.startedAt)} · {shortId(turn.trace.traceId)} ·{" "}
                          {formatDuration(turn.trace.durationMs)} ·{" "}
                          {formatCost(turn.trace.totalCost)}
                        </p>
                      </div>
                      <Link
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                        to="/$projectId/traces/$traceId"
                        params={{ projectId: props.projectId, traceId: turn.trace.traceId }}
                      >
                        Open trace <ExternalLink />
                      </Link>
                    </div>
                    {rows.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">No spans captured</p>
                    ) : (
                      <div
                        className="rounded-lg border bg-background py-1"
                        role="tree"
                        aria-label={`Spans for ${turn.trace.name}`}
                      >
                        {rows.map((row) => (
                          <SpanTreeRow
                            key={row.span.spanId}
                            collapsed={collapsed.has(row.span.spanId)}
                            row={row}
                            selected={
                              selectedSpan?.traceId === turn.trace.traceId &&
                              selectedSpan.spanId === row.span.spanId
                            }
                            onSelect={() => handleSelectSpan(turn.trace.traceId, row.span.spanId)}
                            onToggle={() =>
                              toggleCollapsed(collapsed, row.span.spanId, setCollapsed)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })
            )}
            {props.hasMore ? (
              <div className="flex justify-center p-6">
                <Button variant="outline" disabled={props.isLoadingMore} onClick={props.onLoadMore}>
                  {props.isLoadingMore ? "Loading more…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-col border-t bg-background lg:border-t-0 lg:border-l">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex h-8 items-center rounded-md border bg-muted/50 p-0.5">
          {(
            [
              ["details", "Thread info"],
              ["step", "Step details"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              aria-pressed={rightTab === tab}
              className={cn(
                "flex h-6 items-center rounded px-2 text-xs font-medium text-muted-foreground",
                rightTab === tab && "bg-background text-foreground shadow-sm",
              )}
              onClick={() => setRightTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
        {rightTab === "step" && selectedSpan ? (
          <Link
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            to="/$projectId/traces/$traceId"
            params={{ projectId: props.projectId, traceId: selectedSpan.traceId }}
            search={{ span: selectedSpan.spanId }}
          >
            Open in Trace <ExternalLink />
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rightTab === "step" && selectedSpan ? (
          <ThreadStepInspector
            projectId={props.projectId}
            traceId={selectedSpan.traceId}
            spanId={selectedSpan.spanId}
          />
        ) : rightTab === "step" ? (
          <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
            Select a step or span on the left to inspect its full input, output, and metadata.
          </div>
        ) : (
          <SessionMetadata detail={props.detail} embedded />
        )}
      </div>
    </div>
  );

  return (
    <main className="flex h-[calc(100svh-3.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
      {isMobile ? (
        <div className="grid min-h-0 flex-1 overflow-auto">
          {leftPane}
          {rightPane}
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanel defaultSize="62" minSize="40" className="min-h-0 overflow-hidden">
            {leftPane}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="38" minSize="26" className="min-h-0 overflow-hidden">
            {rightPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
      <DataDeletionDialog
        entityType="session"
        ids={deleteOpen ? [summary.sessionId] : []}
        pending={props.deletionPending ?? false}
        onOpenChange={setDeleteOpen}
        onConfirm={() => props.onDelete?.()}
      />
    </main>
  );
}

function ThreadStepInspector(props: { projectId: string; traceId: string; spanId: string }) {
  const span = useQuery({
    queryKey: ["trace-span", props.projectId, props.traceId, props.spanId],
    queryFn: ({ signal }) =>
      api<SpanDetail>(
        `/api/v1/projects/${props.projectId}/traces/${props.traceId}/spans/${props.spanId}`,
        { signal },
      ),
    staleTime: 5 * 60 * 1_000,
  });

  return (
    <SpanInspectorState
      error={span.error}
      loading={span.isLoading}
      selectedSpanId={props.spanId}
      span={span.data}
      onRetry={() => void span.refetch()}
    />
  );
}
