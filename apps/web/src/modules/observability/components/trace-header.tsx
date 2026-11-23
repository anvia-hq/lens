import type { TraceDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { ExternalLink, Trash } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/trace-detail";
import { ObservationGlyph } from "./observation-glyph";
import { StatusPill } from "./status-pill";

export function TraceHeader({
  actions,
  detail,
  projectId,
  canDelete,
  onDelete,
}: {
  actions?: ReactNode;
  detail: TraceDetail;
  projectId: string;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const summary = detail.summary;
  return (
    <header className="shrink-0 border-b bg-background px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ObservationGlyph kind={detail.spans[0]?.observationKind ?? "span"} size="medium" />
          <h1 className="truncate text-base font-semibold tracking-tight">{summary.name}</h1>
          <StatusPill status={summary.status} />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {formatTimestamp(summary.startedAt)}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">
            ·
          </span>
          <span
            className="hidden font-mono text-xs text-muted-foreground md:inline"
            title={summary.traceId}
          >
            {shortId(summary.traceId)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {canDelete ? (
            <Button
              className="h-7 px-2.5 text-xs"
              size="sm"
              variant="destructive"
              onClick={onDelete}
            >
              <Trash className="size-3.5" /> Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <InlineMetric label="Duration" value={formatDuration(summary.durationMs)} />
          <InlineMetric label="Spans" value={formatNumber(summary.spanCount)} />
          <InlineMetric label="Tokens" value={formatNumber(summary.totalTokens)} />
          <InlineMetric label="Cost" value={formatCost(summary.totalCost)} />
          {summary.sessionId ? (
            <div className="flex min-w-0 items-center gap-1">
              <dt className="text-muted-foreground">Thread</dt>
              <dd className="min-w-0">
                <Link
                  className="group flex min-w-0 items-center gap-1 font-mono font-medium hover:underline"
                  to="/$projectId/threads/$sessionId"
                  params={{ projectId, sessionId: summary.sessionId }}
                  title={summary.sessionId}
                >
                  <span className="max-w-44 truncate">{shortId(summary.sessionId)}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-1">
          <Badge className="h-5 px-1.5 text-xs" variant="outline">
            {summary.environment}
          </Badge>
          <Badge className="h-5 px-1.5 text-xs" variant="outline">
            {summary.serviceName}
            {summary.serviceVersion ? `@${summary.serviceVersion}` : ""}
          </Badge>
          {summary.release ? (
            <Badge className="h-5 px-1.5 text-xs" variant="secondary">
              Release {summary.release}
            </Badge>
          ) : null}
          {summary.version ? (
            <Badge className="h-5 px-1.5 text-xs" variant="secondary">
              Version {summary.version}
            </Badge>
          ) : null}
          {summary.userId ? (
            <Badge
              className="h-5 max-w-44 px-1.5 text-xs"
              variant="outline"
              title={`User ${summary.userId}`}
            >
              <span className="truncate">User {summary.userId}</span>
            </Badge>
          ) : null}
          {summary.tags.map((tag) => (
            <Badge key={tag} className="h-5 px-1.5 text-xs" variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {detail.evaluations.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t pt-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Evaluations</span>
          {detail.evaluationsTruncated ? (
            <span className="w-full text-xs text-muted-foreground" role="status">
              Showing the newest {detail.evaluations.length} of {detail.evaluationsTotal}{" "}
              evaluations. Older results are not shown.
            </span>
          ) : null}
          {detail.evaluations.map((evaluation) => (
            <Badge
              key={evaluation.id}
              className="h-5 px-1.5 text-xs"
              variant="outline"
              title={evaluation.explanation ?? undefined}
            >
              {evaluation.metricName}:{" "}
              {evaluation.numericValue ?? evaluation.categoricalValue ?? evaluation.outcome}
              <span className="text-muted-foreground">({evaluation.outcome})</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
