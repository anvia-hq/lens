import type { SessionDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Chats as MessagesSquare } from "@phosphor-icons/react";
import { formatCost, formatDuration, formatNumber, formatTimestamp } from "../utils/session";
import { MetadataRow } from "./metadata-row";
import { MetadataSection } from "./metadata-section";
import { MetadataValues } from "./metadata-values";
export function SessionMetadata({ detail }: { detail: SessionDetail }) {
  const summary = detail.summary;
  return (
    <aside className="min-w-0 border-t bg-background lg:overflow-auto lg:border-t-0 lg:border-l">
      <div className="grid gap-6 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-600 text-white">
            <MessagesSquare className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Session details</p>
            <h1 className="break-all font-mono text-sm font-semibold tracking-tight">
              {summary.sessionId}
            </h1>
          </div>
        </div>

        <MetadataSection title="Overview">
          <MetadataRow label="Status">
            <Badge variant={summary.status === "error" ? "destructive" : "secondary"}>
              {summary.status === "error" ? `${summary.errorCount} errors` : "Success"}
            </Badge>
          </MetadataRow>
          <MetadataRow label="User">
            <span className="break-all font-mono">{summary.userId ?? "—"}</span>
          </MetadataRow>
          <MetadataRow label="Started">{formatTimestamp(summary.startedAt)}</MetadataRow>
          <MetadataRow label="Ended">{formatTimestamp(summary.endedAt)}</MetadataRow>
          <MetadataRow label="Last seen">{formatTimestamp(summary.lastSeenAt)}</MetadataRow>
          <MetadataRow label="Duration">{formatDuration(summary.durationMs)}</MetadataRow>
        </MetadataSection>

        <MetadataSection title="Usage">
          <MetadataRow label="Traces">{formatNumber(summary.traceCount)}</MetadataRow>
          <MetadataRow label="Spans">{formatNumber(summary.spanCount)}</MetadataRow>
          <MetadataRow label="Input tokens">{formatNumber(summary.inputTokens)}</MetadataRow>
          <MetadataRow label="Output tokens">{formatNumber(summary.outputTokens)}</MetadataRow>
          <MetadataRow label="Total tokens">{formatNumber(summary.totalTokens)}</MetadataRow>
          <MetadataRow label="Input cost">{formatCost(summary.inputCost)}</MetadataRow>
          <MetadataRow label="Output cost">{formatCost(summary.outputCost)}</MetadataRow>
          <MetadataRow label="Total cost">{formatCost(summary.totalCost)}</MetadataRow>
        </MetadataSection>

        <MetadataValues label="Models" values={summary.models} />
        <MetadataValues label="Services" values={summary.services} />
        <MetadataValues label="Environments" values={summary.environments} />
        <MetadataValues label="Tags" values={summary.tags} />
      </div>
    </aside>
  );
}
