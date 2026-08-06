import type { TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Link } from "@tanstack/react-router";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/trace-detail";
import { HeaderMetric } from "./header-metric";
import { ObservationGlyph } from "./observation-glyph";
import { StatusPill } from "./status-pill";

export function TraceHeader({ detail, projectId }: { detail: TraceDetail; projectId: string }) {
  const summary = detail.summary;
  return (
    <header className="shrink-0 border-b bg-background px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ObservationGlyph kind={detail.spans[0]?.observationKind ?? "span"} size="large" />
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{summary.name}</h1>
              <StatusPill status={summary.status} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatTimestamp(summary.startedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono" title={summary.traceId}>
                {shortId(summary.traceId)}
              </span>
              <Badge variant="outline">{summary.environment}</Badge>
              <Badge variant="outline">
                {summary.serviceName}
                {summary.serviceVersion ? `@${summary.serviceVersion}` : ""}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
          <HeaderMetric label="Duration" value={formatDuration(summary.durationMs)} />
          <HeaderMetric label="Spans" value={formatNumber(summary.spanCount)} />
          <HeaderMetric label="Tokens" value={formatNumber(summary.totalTokens)} />
          <HeaderMetric label="Cost" value={formatCost(summary.totalCost)} />
          {summary.sessionId ? (
            <Link
              className="grid min-w-24 gap-0.5 rounded-md border bg-muted/20 px-2.5 py-1.5 hover:bg-muted/60"
              to="/$projectId/sessions/$sessionId"
              params={{ projectId, sessionId: summary.sessionId }}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Session
              </span>
              <span className="max-w-32 truncate font-mono text-xs">{summary.sessionId}</span>
            </Link>
          ) : null}
        </div>
      </div>
      {summary.release || summary.version || summary.userId || summary.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.release ? <Badge variant="secondary">Release {summary.release}</Badge> : null}
          {summary.version ? <Badge variant="secondary">Version {summary.version}</Badge> : null}
          {summary.userId ? <Badge variant="outline">User {summary.userId}</Badge> : null}
          {summary.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
    </header>
  );
}
