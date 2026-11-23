import type { SpanDetail } from "@lens/contracts";
import {
  Activity,
  Code as Braces,
  Clock12 as Clock3,
  Database,
  Sparkles,
} from "@mynaui/icons-react";
import { useMemo } from "react";
import {
  formatCost,
  formatDuration,
  formatNanoTimestamp,
  formatNumber,
  shortId,
  spanDurationMs,
} from "../utils/trace-detail";
import { MetricPill } from "./metric-pill";
import { ObservationGlyph } from "./observation-glyph";
import { SpanPayloadSection } from "./span-payload-section";
import { StatusPill } from "./status-pill";

export function SpanInspector(props: { span: SpanDetail }) {
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
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      aria-label="Selected span data"
    >
      <header className="shrink-0 min-w-0 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ObservationGlyph kind={span.observationKind} status={span.status} size="medium" />
            <h2 className="truncate text-sm font-semibold tracking-tight">{span.name}</h2>
            <StatusPill status={span.status} />
          </div>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {span.observationKind} · {formatNanoTimestamp(span.startTimeUnixNano)}
          </span>
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
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
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground sm:ml-auto">
            <span title={span.spanId}>Span {shortId(span.spanId)}</span>
            {span.parentSpanId ? (
              <span title={span.parentSpanId}>Parent {shortId(span.parentSpanId)}</span>
            ) : null}
            {span.scopeName ? <span className="truncate">Scope {span.scopeName}</span> : null}
          </div>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4 p-4">
          <SpanPayloadSection field="input" title="Input" value={span.input} />
          <SpanPayloadSection field="output" title="Output" value={span.output} />
          {span.status === "error" || span.statusMessage ? (
            <section className="min-w-0 overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5">
              <header className="flex min-w-0 items-center border-b border-destructive/20 bg-destructive/10 px-3 py-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  Error
                </h3>
              </header>
              <div className="px-3.5 py-3 text-xs leading-5 text-destructive">
                {span.statusMessage || "This span finished with an error."}
              </div>
            </section>
          ) : null}
          <SpanPayloadSection field="metadata" title="Metadata" value={metadata} />
        </div>
      </div>
    </section>
  );
}
