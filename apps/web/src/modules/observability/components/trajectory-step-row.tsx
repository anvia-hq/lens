import { cn } from "@lens/ui/lib/utils";
import { ChevronRight } from "@mynaui/icons-react";
import { useState } from "react";
import { extractStructuredPreviewFields, formatStepOneLine } from "../utils/preview-format";
import { formatDuration, formatNumber } from "../utils/trace-detail";
import type { TrajectoryStep } from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { ObservationGlyph } from "./observation-glyph";
import { RailRow } from "./trajectory-rail";

/**
 * One execution step on the trajectory rail: glyph on the rail, name and model, a one-line
 * preview, and right-aligned token / duration columns so steps scan like a table.
 */
export function TrajectoryStepRow(props: {
  step: TrajectoryStep;
  /** Longest step duration in the turn; sizes the relative duration bar. */
  maxDurationMs: number;
  selected: boolean;
  last?: boolean;
  onSelect: () => void;
}) {
  const { span, depth, durationMs } = props.step;
  const failed = span.status === "error";
  const preview = span.outputPreview ?? span.inputPreview;
  const expandable = Boolean(span.inputPreview || span.outputPreview || span.statusMessage);
  const [expanded, setExpanded] = useState(failed);
  const durationRatio = props.maxDurationMs > 0 ? durationMs / props.maxDurationMs : 0;

  return (
    <RailRow
      last={props.last}
      marker={<ObservationGlyph kind={span.observationKind} status={span.status} />}
      selected={props.selected}
      onSelect={props.onSelect}
    >
      <div style={depth > 0 ? { paddingLeft: `${Math.min(depth, 4) * 0.75}rem` } : undefined}>
        <div className="flex h-5 min-w-0 items-center gap-2">
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm font-medium outline-none focus-visible:underline"
            title={span.name}
            onClick={(event) => {
              event.stopPropagation();
              props.onSelect();
            }}
          >
            {span.name}
          </button>
          {span.model && !span.name.includes(span.model) ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{span.model}</span>
          ) : null}
          {failed ? (
            <span className="shrink-0 text-xs font-medium text-destructive">Error</span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-muted @md:block">
              <span
                className={cn(
                  "block h-full rounded-full",
                  failed ? "bg-destructive" : "bg-foreground/40",
                )}
                style={{ width: `${Math.max(4, Math.round(durationRatio * 100))}%` }}
              />
            </span>
            <span className="hidden w-16 text-right @sm:inline">
              {span.totalTokens > 0 ? `${formatNumber(span.totalTokens)} tok` : ""}
            </span>
            <span className="w-12 text-right">{formatDuration(durationMs)}</span>
          </span>
          {expandable ? (
            <button
              type="button"
              aria-label={expanded ? `Collapse ${span.name}` : `Expand ${span.name}`}
              aria-expanded={expanded}
              className="-mr-1 grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-control-hover hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              <ChevronRight
                className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <span className="-mr-1 size-5 shrink-0" />
          )}
        </div>
        {!expanded && preview ? (
          <p className="truncate text-xs text-muted-foreground">{formatStepOneLine(preview)}</p>
        ) : null}
        {expanded ? (
          <div className="mt-1.5 mb-1 grid min-w-0 gap-2.5 pr-6">
            {span.statusMessage ? (
              <p className="min-w-0 break-words text-xs text-destructive [overflow-wrap:anywhere]">
                {span.statusMessage}
              </p>
            ) : null}
            {span.inputPreview ? <StepPayload label="Input" value={span.inputPreview} /> : null}
            {span.outputPreview ? <StepPayload label="Output" value={span.outputPreview} /> : null}
          </div>
        ) : null}
      </div>
    </RailRow>
  );
}

function StepPayload(props: { label: string; value: string }) {
  const structured = extractStructuredPreviewFields(props.value, 6);
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {structured ? (
        <dl className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {structured.map((field) => (
            <div key={field.key} className="contents">
              <dt className="font-mono text-muted-foreground">{field.key}</dt>
              <dd className="m-0 line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere]">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : looksLikeJsonPreview(props.value) ? (
        <p className="m-0 line-clamp-4 min-w-0 font-mono text-xs break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
          {formatStepOneLine(props.value)}
        </p>
      ) : (
        <MarkdownContent compact content={props.value} />
      )}
    </div>
  );
}
