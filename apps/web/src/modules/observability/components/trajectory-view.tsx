import { Button, buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import {
  Activity,
  Microchip as Bot,
  Clock12 as Clock3,
  Dollar as Coins,
  ExternalLink,
  Message as MessageCircle,
  User,
} from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/session";
import { filterTrajectorySteps, type TrajectoryTurn } from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { MetricPill } from "./metric-pill";
import { StatusPill } from "./status-pill";
import { TrajectoryStepCard } from "./trajectory-step-card";

export function TrajectoryView(props: {
  turns: TrajectoryTurn[];
  projectId: string;
  mode: "trace" | "thread";
  search?: string;
  selectedTraceId?: string;
  selectedSpanId?: string;
  onSelectSpan: (traceId: string, spanId: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  if (props.turns.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center p-8 text-center">
        <div className="grid max-w-sm gap-2">
          <MessageCircle className="mx-auto size-8 text-muted-foreground" />
          <span className="text-sm font-medium">No trajectory data captured</span>
          <span className="text-xs text-muted-foreground">
            Spans and execution payloads will appear here as telemetry arrives.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 content-start">
      {props.turns.map((turn, index) => {
        const steps = props.search ? filterTrajectorySteps(turn.steps, props.search) : turn.steps;
        const turnSelected =
          props.selectedTraceId === undefined || props.selectedTraceId === turn.trace.traceId;
        const firstSpanId = turn.allSpans[0]?.spanId;

        return (
          <article
            key={turn.trace.traceId}
            className={cn(
              "grid min-w-0 grid-cols-1 gap-3 bg-background",
              props.mode === "thread" ? "border-b px-4 py-5 md:px-6" : "p-3",
            )}
          >
            {props.mode === "thread" ? (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Turn {index + 1}
                    </span>
                    <StatusPill status={turn.trace.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">{turn.trace.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {formatTimestamp(turn.trace.startedAt)} · {shortId(turn.trace.traceId)}
                  </p>
                </div>
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  to="/$projectId/traces/$traceId"
                  params={{ projectId: props.projectId, traceId: turn.trace.traceId }}
                >
                  Open trace <ExternalLink />
                </Link>
              </div>
            ) : null}

            {turn.userInput ? (
              <TrajectoryBubble
                compact={props.mode === "trace"}
                icon={<User />}
                iconClassName="bg-background shadow-xs"
                label="Input"
                selected={
                  turnSelected &&
                  Boolean(turn.userInput.spanId) &&
                  props.selectedSpanId === turn.userInput.spanId
                }
                spanName={turn.userInput.spanName}
                text={turn.userInput.text}
                tone="muted"
                onSelect={() => {
                  const targetSpanId = turn.userInput?.spanId || firstSpanId;
                  if (targetSpanId) props.onSelectSpan(turn.trace.traceId, targetSpanId);
                }}
              />
            ) : null}

            {steps.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-1.5">
                <div className="flex min-w-0 items-center justify-between px-1 text-[11px] font-medium text-muted-foreground">
                  <span>Execution steps ({formatNumber(steps.length)})</span>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-1.5">
                  {steps.map((step) => (
                    <TrajectoryStepCard
                      key={step.span.spanId}
                      step={step}
                      selected={turnSelected && props.selectedSpanId === step.span.spanId}
                      onSelect={() => props.onSelectSpan(turn.trace.traceId, step.span.spanId)}
                    />
                  ))}
                </div>
              </div>
            ) : props.search?.trim() ? (
              <p className="px-1 text-xs text-muted-foreground">
                No execution steps match &ldquo;{props.search}&rdquo;.
              </p>
            ) : null}

            {turn.assistantOutput ? (
              <TrajectoryBubble
                compact={props.mode === "trace"}
                icon={<Bot />}
                iconClassName="bg-muted"
                label="Output"
                selected={
                  turnSelected &&
                  Boolean(turn.assistantOutput.spanId) &&
                  props.selectedSpanId === turn.assistantOutput.spanId
                }
                spanName={turn.assistantOutput.spanName}
                text={turn.assistantOutput.text}
                tone="default"
                onSelect={() => {
                  const targetSpanId = turn.assistantOutput?.spanId || firstSpanId;
                  if (targetSpanId) props.onSelectSpan(turn.trace.traceId, targetSpanId);
                }}
              />
            ) : null}

            {!turn.userInput && !turn.assistantOutput && steps.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                No input, output, or step payloads captured for this trace.
              </div>
            ) : null}

            {props.mode === "thread" ? (
              <div className="flex flex-wrap gap-2">
                <MetricPill
                  icon={<Clock3 />}
                  label="Duration"
                  value={formatDuration(turn.trace.durationMs)}
                />
                <MetricPill
                  icon={<Activity />}
                  label="Steps"
                  value={formatNumber(turn.trace.spanCount)}
                />
                <MetricPill
                  icon={<Coins />}
                  label="Cost"
                  value={formatCost(turn.trace.totalCost)}
                />
              </div>
            ) : null}
          </article>
        );
      })}

      {props.hasMore ? (
        <div className="flex justify-center p-6">
          <Button variant="outline" disabled={props.isLoadingMore} onClick={props.onLoadMore}>
            {props.isLoadingMore ? "Loading more…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TrajectoryBubble(props: {
  compact: boolean;
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  selected: boolean;
  spanName?: string;
  text: string;
  tone: "muted" | "default";
  onSelect: () => void;
}) {
  const isJson = looksLikeJsonPreview(props.text);
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "grid w-full min-w-0 max-w-full cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-hidden rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.selected
          ? "border-primary bg-row-active/60"
          : props.tone === "muted"
            ? "border-border bg-muted/30 hover:bg-muted/60"
            : "border-border bg-background hover:bg-muted/40",
      )}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
    >
      <span
        className={cn(
          "row-span-2 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground [&_svg]:size-3.5",
          props.iconClassName,
        )}
      >
        {props.icon}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs font-medium">
        <span className="shrink-0">{props.label}</span>
        {props.spanName ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {props.spanName}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 max-w-full overflow-hidden">
        {isJson ? (
          <p className="m-0 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[11px] leading-5 text-foreground/90">
            {props.text}
          </p>
        ) : (
          <MarkdownContent compact={props.compact} content={props.text} />
        )}
      </div>
    </div>
  );
}
