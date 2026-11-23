import { Badge } from "@lens/ui/components/badge";
import { cn } from "@lens/ui/lib/utils";
import { ChevronDown, ChevronRight } from "@mynaui/icons-react";
import { useState } from "react";
import { extractStructuredPreviewFields, formatStepOneLine } from "../utils/preview-format";
import { formatCost, formatDuration, formatNumber } from "../utils/trace-detail";
import type { TrajectoryStep } from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { ObservationGlyph } from "./observation-glyph";

export function TrajectoryStepCard(props: {
  compact?: boolean;
  step: TrajectoryStep;
  selected: boolean;
  onSelect: () => void;
}) {
  const { span, depth, durationMs } = props.step;
  const hasPreviewContent =
    Boolean(span.inputPreview) || Boolean(span.outputPreview) || Boolean(span.statusMessage);
  const [expanded, setExpanded] = useState(span.status === "error");
  const oneLineSummary =
    !expanded && (span.outputPreview || span.inputPreview)
      ? formatStepOneLine(span.outputPreview ?? span.inputPreview ?? "")
      : null;

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-md border transition-colors",
        props.selected
          ? "border-border-strong bg-row-active"
          : span.status === "error"
            ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
            : "border-border/60 bg-background hover:border-border hover:bg-muted/30",
      )}
      style={depth > 0 ? { marginLeft: `${Math.min(depth, 4) * 14}px` } : undefined}
    >
      <div className="flex min-w-0 max-w-full items-center gap-1.5 px-2 py-1.5">
        {hasPreviewContent ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${span.name}` : `Expand ${span.name}`}
            aria-expanded={expanded}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-control-hover hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => !current);
            }}
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left"
          onClick={props.onSelect}
        >
          <ObservationGlyph kind={span.observationKind} status={span.status} />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-foreground" title={span.name}>
                {span.name}
              </span>
              {!props.compact ? (
                <Badge variant="outline" className="h-4 shrink-0 px-1 text-xs capitalize">
                  {span.observationKind}
                </Badge>
              ) : null}
              {span.model ? (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {span.model}
                </span>
              ) : null}
              {span.status === "error" ? (
                <Badge variant="destructive" className="h-4 shrink-0 px-1 text-xs">
                  Error
                </Badge>
              ) : null}
            </div>
            {oneLineSummary ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{oneLineSummary}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
            <span>{formatDuration(durationMs)}</span>
            {span.totalTokens > 0 ? <span>{formatNumber(span.totalTokens)} tok</span> : null}
            {!props.compact && span.totalCost !== null ? (
              <span>{formatCost(span.totalCost)}</span>
            ) : null}
          </div>
        </button>
      </div>
      {expanded && hasPreviewContent ? (
        <div
          className="grid min-w-0 grid-cols-1 gap-2 border-t border-border/60 bg-muted/15 px-3 py-2 text-xs"
          onClick={props.onSelect}
          role="presentation"
        >
          {span.statusMessage ? (
            <div className="min-w-0 break-words [overflow-wrap:anywhere] rounded bg-destructive/10 px-2.5 py-1.5 text-destructive">
              {span.statusMessage}
            </div>
          ) : null}
          {span.inputPreview ? <StepPreviewField label="Input" value={span.inputPreview} /> : null}
          {span.outputPreview ? (
            <StepPreviewField label="Output" value={span.outputPreview} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepPreviewField(props: { label: string; value: string }) {
  const structured = extractStructuredPreviewFields(props.value, 4);
  const formattedLine = formatStepOneLine(props.value);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </span>
      {structured ? (
        <dl className="m-0 grid min-w-0 grid-cols-1 gap-1">
          {structured.map((field) => (
            <div
              key={field.key}
              className="grid min-w-0 grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] gap-2 text-xs leading-4"
            >
              <dt className="truncate font-mono text-muted-foreground">{field.key}</dt>
              <dd className="m-0 line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] text-foreground/90">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : looksLikeJsonPreview(props.value) ? (
        <p className="m-0 min-w-0 line-clamp-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5 text-foreground/90">
          {formattedLine}
        </p>
      ) : (
        <MarkdownContent compact content={props.value} />
      )}
    </div>
  );
}
