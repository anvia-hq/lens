import { Badge } from "@lens/ui/components/badge";
import { cn } from "@lens/ui/lib/utils";
import { ChevronDown, ChevronRight } from "@mynaui/icons-react";
import { useState } from "react";
import { formatCost, formatDuration, formatNumber } from "../utils/trace-detail";
import type { TrajectoryStep } from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { ObservationGlyph } from "./observation-glyph";

export function TrajectoryStepCard(props: {
  step: TrajectoryStep;
  selected: boolean;
  onSelect: () => void;
}) {
  const { span, depth, durationMs } = props.step;
  const hasPreviewContent =
    Boolean(span.inputPreview) || Boolean(span.outputPreview) || Boolean(span.statusMessage);
  const [expanded, setExpanded] = useState(span.status === "error");

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-lg border transition-colors",
        props.selected
          ? "border-primary bg-row-active/60"
          : span.status === "error"
            ? "border-destructive/40 bg-destructive/5 hover:border-destructive/70"
            : "border-border bg-background hover:bg-muted/40",
      )}
      style={depth > 0 ? { marginLeft: `${Math.min(depth, 4) * 16}px` } : undefined}
    >
      <div className="flex min-w-0 max-w-full items-center gap-2 px-2.5 py-2">
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
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
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
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-xs font-medium text-foreground" title={span.name}>
                {span.name}
              </span>
              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] capitalize">
                {span.observationKind}
              </Badge>
              {span.model ? (
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {span.model}
                </span>
              ) : null}
              {span.status === "error" ? (
                <Badge variant="destructive" className="h-4 shrink-0 px-1 text-[10px]">
                  Error
                </Badge>
              ) : null}
            </div>
            {!expanded && (span.inputPreview || span.outputPreview) ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {span.outputPreview ?? span.inputPreview}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span>{formatDuration(durationMs)}</span>
            {span.totalTokens > 0 ? <span>{formatNumber(span.totalTokens)} tok</span> : null}
            {span.totalCost !== null ? <span>{formatCost(span.totalCost)}</span> : null}
          </div>
        </button>
      </div>
      {expanded && hasPreviewContent ? (
        <div
          className="grid min-w-0 grid-cols-1 gap-2 border-t px-3 py-2 text-xs"
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
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </span>
      {looksLikeJsonPreview(props.value) ? (
        <p className="m-0 min-w-0 line-clamp-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[11px] leading-5 text-foreground/90">
          {props.value}
        </p>
      ) : (
        <MarkdownContent compact content={props.value} />
      )}
    </div>
  );
}
