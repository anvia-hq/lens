import type { SpanDetail } from "@lens/contracts";
import {
  Pulse as Activity,
  BracketsCurly as Braces,
  Clock as Clock3,
  Database,
  Sparkle as Sparkles,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import type { TracePayloadView } from "../types";
import {
  formatCost,
  formatDuration,
  formatNanoTimestamp,
  formatNumber,
  spanDurationMs,
} from "../utils/trace-detail";
import { MetricPill } from "./metric-pill";
import { ObservationGlyph } from "./observation-glyph";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";
import { SectionTitle } from "./section-title";
import { StatusPill } from "./status-pill";

export function SpanInspector(props: {
  span: SpanDetail;
  payloadView: TracePayloadView;
  onPayloadViewChange: (view: TracePayloadView) => void;
}) {
  const span = props.span;
  const metadata = useMemo(
    () => ({
      trace: {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        traceState: span.traceState,
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.endTimeUnixNano,
        durationNano: span.durationNano,
      },
      instrumentation: {
        serviceName: span.serviceName,
        serviceVersion: span.serviceVersion,
        scopeName: span.scopeName,
        scopeVersion: span.scopeVersion,
        kind: span.kind,
        observationKind: span.observationKind,
        environment: span.environment,
        release: span.release,
        version: span.version,
      },
      resourceAttributes: span.resourceAttributes,
      spanAttributes: span.spanAttributes,
      events: span.events,
      links: span.links,
      ingestedAt: span.ingestedAt,
    }),
    [span],
  );
  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Selected span data">
      <header className="shrink-0 border-b px-4 py-4 md:px-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ObservationGlyph kind={span.observationKind} status={span.status} size="large" />
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight">{span.name}</h2>
                <StatusPill status={span.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                {span.observationKind} · {formatNanoTimestamp(span.startTimeUnixNano)}
              </span>
            </div>
          </div>
          <PayloadViewSwitch value={props.payloadView} onChange={props.onPayloadViewChange} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <MetricPill
            icon={<Clock3 />}
            label="Duration"
            value={formatDuration(spanDurationMs(span))}
          />
          <MetricPill
            icon={<Braces />}
            label="Tokens"
            value={`${formatNumber(span.inputTokens)} in · ${formatNumber(span.outputTokens)} out`}
          />
          <MetricPill icon={<Database />} label="Cost" value={formatCost(span.totalCost)} />
          {span.model ? <MetricPill icon={<Sparkles />} label="Model" value={span.model} /> : null}
          <MetricPill icon={<Activity />} label="Service" value={span.serviceName} />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span title={span.spanId}>Span {span.spanId}</span>
          {span.parentSpanId ? (
            <span title={span.parentSpanId}>Parent {span.parentSpanId}</span>
          ) : null}
          {span.scopeName ? <span>Scope {span.scopeName}</span> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="grid content-start gap-6 p-4 md:p-6">
          <PayloadSection title="Input" value={span.input} view={props.payloadView} />
          <PayloadSection title="Output" value={span.output} view={props.payloadView} />
          {span.status === "error" || span.statusMessage ? (
            <section className="grid gap-2">
              <SectionTitle title="Error" />
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {span.statusMessage || "This span finished with an error."}
              </div>
            </section>
          ) : null}
          <PayloadSection title="Metadata" value={metadata} view={props.payloadView} />
        </div>
      </div>
    </section>
  );
}
