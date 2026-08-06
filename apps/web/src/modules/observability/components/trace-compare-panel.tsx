import type { TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button, buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { ArrowLeft, ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { TracePayloadView, TraceSpanView } from "../types";
import {
  buildSpanForest,
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
  storedPayloadView,
  TRACE_PAYLOAD_STORAGE_KEY,
} from "../utils/trace-detail";
import { HeaderMetric } from "./header-metric";
import { ObservationGlyph } from "./observation-glyph";
import { SpanInspector } from "./span-inspector";
import { StatusPill } from "./status-pill";
import { TraceNavigator } from "./trace-navigator";

export function TraceComparePanel(props: { detail: TraceDetail; projectId: string }) {
  const summary = props.detail.summary;
  const forest = useMemo(() => buildSpanForest(props.detail.spans), [props.detail.spans]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [selectedSpanId, setSelectedSpanId] = useState<string>();
  const [view, setView] = useState<TraceSpanView>("tree");
  const [payloadView, setPayloadView] = useState<TracePayloadView>(() => storedPayloadView());
  const selected = props.detail.spans.find((span) => span.spanId === selectedSpanId);
  const changePayloadView = (next: TracePayloadView) => {
    setPayloadView(next);
    try {
      window.localStorage.setItem(TRACE_PAYLOAD_STORAGE_KEY, next);
    } catch {
      // The tile still keeps the in-memory preference when storage is unavailable.
    }
  };

  return (
    <article className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-background">
      <header className="shrink-0 border-b px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <ObservationGlyph
            kind={props.detail.spans[0]?.observationKind ?? "span"}
            status={summary.status}
            size="large"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold" title={summary.name}>
                {summary.name}
              </h2>
              <StatusPill status={summary.status} />
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
              <span>{formatTimestamp(summary.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono" title={summary.traceId}>
                {shortId(summary.traceId)}
              </span>
              <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
                {summary.environment}
              </Badge>
              <Badge className="h-5 max-w-44 truncate px-1.5 text-[10px]" variant="outline">
                {summary.serviceName}
              </Badge>
            </div>
          </div>
          <Link
            aria-label={`Open ${summary.name}`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            params={{ projectId: props.projectId, traceId: summary.traceId }}
            search={{}}
            title="Open full trace"
            to="/$projectId/traces/$traceId"
          >
            <ExternalLink />
          </Link>
        </div>
        <dl className="mt-2 grid grid-cols-4 gap-2 border-t pt-2">
          <HeaderMetric label="Duration" value={formatDuration(summary.durationMs)} />
          <HeaderMetric label="Spans" value={formatNumber(summary.spanCount)} />
          <HeaderMetric label="Tokens" value={formatNumber(summary.totalTokens)} />
          <HeaderMetric label="Cost" value={formatCost(summary.totalCost)} />
        </dl>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <TraceNavigator
          collapsed={collapsed}
          detail={props.detail}
          forest={forest}
          search={search}
          selectedSpanId={selectedSpanId}
          view={view}
          onCollapsedChange={setCollapsed}
          onSearchChange={setSearch}
          onSelectSpan={setSelectedSpanId}
          onViewChange={setView}
        />
        <div
          aria-hidden={selected === undefined}
          className={cn(
            "absolute inset-0 z-20 flex min-h-0 flex-col bg-background shadow-xl transition-transform duration-200",
            selected === undefined ? "pointer-events-none translate-x-full" : "translate-x-0",
          )}
        >
          {selected === undefined ? null : (
            <>
              <div className="shrink-0 border-b p-1.5">
                <Button variant="ghost" size="sm" onClick={() => setSelectedSpanId(undefined)}>
                  <ArrowLeft /> Back to spans
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <SpanInspector
                  payloadView={payloadView}
                  span={selected}
                  onPayloadViewChange={changePayloadView}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
