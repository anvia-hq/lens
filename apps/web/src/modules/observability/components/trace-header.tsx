import type { TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
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
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(6rem,8rem))_minmax(10rem,1fr)]">
        <HeaderMetric label="Duration" value={formatDuration(summary.durationMs)} />
        <HeaderMetric label="Spans" value={formatNumber(summary.spanCount)} />
        <HeaderMetric label="Tokens" value={formatNumber(summary.totalTokens)} />
        <HeaderMetric label="Cost" value={formatCost(summary.totalCost)} />
        {summary.sessionId ? (
          <div className="grid min-w-0 gap-1">
            <dt className="text-xs text-muted-foreground">Session</dt>
            <dd className="min-w-0">
              <Link
                className="group flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline"
                to="/$projectId/sessions/$sessionId"
                params={{ projectId, sessionId: summary.sessionId }}
              >
                <span className="truncate font-mono">{summary.sessionId}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
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
