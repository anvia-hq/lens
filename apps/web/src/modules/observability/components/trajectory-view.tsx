import { Button, buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Message as MessageCircle,
  Microchip as Bot,
  User,
} from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { extractStructuredPreviewFields } from "../utils/preview-format";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/session";
import { filterTrajectorySteps, type TrajectoryTurn } from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { StatusPill } from "./status-pill";
import { TrajectoryStepCard } from "./trajectory-step-card";

type ActiveAnchor = {
  traceId: string;
  slot: "input" | "output" | "step";
  spanId: string;
};

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
  const [activeAnchor, setActiveAnchor] = useState<ActiveAnchor | null>(null);

  if (props.turns.length === 0) {
    return (
      <div className="grid min-h-64 place-items-center p-8 text-center">
        <div className="grid max-w-sm gap-2">
          <MessageCircle className="mx-auto size-8 text-muted-foreground" />
          <span className="text-base font-medium">No trajectory data captured</span>
          <span className="text-xs text-muted-foreground">
            Spans and execution payloads will appear here as telemetry arrives.
          </span>
        </div>
      </div>
    );
  }

  const selectSlot = (traceId: string, slot: ActiveAnchor["slot"], spanId: string) => {
    setActiveAnchor({ traceId, slot, spanId });
    props.onSelectSpan(traceId, spanId);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 content-start">
      {props.turns.map((turn, index) => (
        <TrajectoryTurnBlock
          key={turn.trace.traceId}
          activeAnchor={activeAnchor}
          index={index}
          mode={props.mode}
          projectId={props.projectId}
          search={props.search}
          selectedSpanId={props.selectedSpanId}
          selectedTraceId={props.selectedTraceId}
          turn={turn}
          onSelectSlot={selectSlot}
        />
      ))}

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

function TrajectoryTurnBlock(props: {
  activeAnchor: ActiveAnchor | null;
  index: number;
  mode: "trace" | "thread";
  projectId: string;
  search?: string;
  selectedSpanId?: string;
  selectedTraceId?: string;
  turn: TrajectoryTurn;
  onSelectSlot: (traceId: string, slot: ActiveAnchor["slot"], spanId: string) => void;
}) {
  const { turn } = props;
  const steps = props.search ? filterTrajectorySteps(turn.steps, props.search) : turn.steps;
  const turnSelected =
    props.selectedTraceId === undefined || props.selectedTraceId === turn.trace.traceId;
  const firstSpanId = turn.allSpans[0]?.spanId;
  const hasErrorStep = steps.some((step) => step.span.status === "error");
  const [stepsOpen, setStepsOpen] = useState(
    () => props.mode === "trace" || steps.length <= 4 || hasErrorStep,
  );

  // Prevent double-highlighting Input & Output simultaneously when both map to the same root span.
  const sameRootSpan =
    Boolean(turn.userInput?.spanId) && turn.userInput?.spanId === turn.assistantOutput?.spanId;
  const anchorMatchesTurn =
    props.activeAnchor?.traceId === turn.trace.traceId &&
    props.activeAnchor.spanId === props.selectedSpanId;

  const inputSelected =
    turnSelected &&
    Boolean(turn.userInput?.spanId) &&
    props.selectedSpanId === turn.userInput?.spanId &&
    (!sameRootSpan || !anchorMatchesTurn || props.activeAnchor?.slot === "input");

  const outputSelected =
    turnSelected &&
    Boolean(turn.assistantOutput?.spanId) &&
    props.selectedSpanId === turn.assistantOutput?.spanId &&
    (!sameRootSpan || (anchorMatchesTurn && props.activeAnchor?.slot === "output"));

  if (props.mode === "trace") {
    return (
      <article className="relative grid min-w-0 grid-cols-1 gap-2 p-2.5">
        {turn.userInput ? (
          <CompactTrajectoryNode
            icon={<User />}
            label="Input"
            selected={inputSelected}
            spanName={turn.userInput.spanName}
            text={turn.userInput.text}
            onSelect={() => {
              const targetSpanId = turn.userInput?.spanId || firstSpanId;
              if (targetSpanId) props.onSelectSlot(turn.trace.traceId, "input", targetSpanId);
            }}
          />
        ) : null}

        {steps.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-1.5 pl-3 border-l border-border/70 ml-3">
            <span className="px-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Steps · {formatNumber(steps.length)}
            </span>
            {steps.map((step) => (
              <TrajectoryStepCard
                key={step.span.spanId}
                compact
                step={step}
                selected={turnSelected && props.selectedSpanId === step.span.spanId}
                onSelect={() => props.onSelectSlot(turn.trace.traceId, "step", step.span.spanId)}
              />
            ))}
          </div>
        ) : props.search?.trim() ? (
          <p className="px-2 text-xs text-muted-foreground">
            No execution steps match &ldquo;{props.search}&rdquo;.
          </p>
        ) : null}

        {turn.assistantOutput ? (
          <CompactTrajectoryNode
            icon={<Bot />}
            label="Output"
            selected={outputSelected}
            spanName={turn.assistantOutput.spanName}
            text={turn.assistantOutput.text}
            onSelect={() => {
              const targetSpanId = turn.assistantOutput?.spanId || firstSpanId;
              if (targetSpanId) props.onSelectSlot(turn.trace.traceId, "output", targetSpanId);
            }}
          />
        ) : null}

        {!turn.userInput && !turn.assistantOutput && steps.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No input, output, or step payloads captured for this trace.
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className="grid min-w-0 grid-cols-1 gap-3 border-b bg-background px-4 py-4 md:px-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Turn {props.index + 1}
          </span>
          <StatusPill status={turn.trace.status} />
          <span className="truncate text-base font-medium">{turn.trace.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTimestamp(turn.trace.startedAt)} · {shortId(turn.trace.traceId)} ·{" "}
            {formatDuration(turn.trace.durationMs)} · {formatNumber(turn.trace.spanCount)} steps
            {turn.trace.totalCost !== null ? ` · ${formatCost(turn.trace.totalCost)}` : ""}
          </span>
        </div>
        <Link
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          to="/$projectId/traces/$traceId"
          params={{ projectId: props.projectId, traceId: turn.trace.traceId }}
        >
          Open trace <ExternalLink />
        </Link>
      </div>

      {turn.userInput ? (
        <ThreadBubble
          icon={<User />}
          label="Input"
          selected={inputSelected}
          spanName={turn.userInput.spanName}
          text={turn.userInput.text}
          tone="muted"
          onSelect={() => {
            const targetSpanId = turn.userInput?.spanId || firstSpanId;
            if (targetSpanId) props.onSelectSlot(turn.trace.traceId, "input", targetSpanId);
          }}
        />
      ) : null}

      {steps.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-1.5">
          <button
            type="button"
            className="flex w-fit items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setStepsOpen((open) => !open)}
          >
            {stepsOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <span>Execution steps ({formatNumber(steps.length)})</span>
          </button>
          {stepsOpen ? (
            <div className="ml-2 grid min-w-0 grid-cols-1 gap-1.5 border-l border-border/70 pl-3">
              {steps.map((step) => (
                <TrajectoryStepCard
                  key={step.span.spanId}
                  step={step}
                  selected={turnSelected && props.selectedSpanId === step.span.spanId}
                  onSelect={() => props.onSelectSlot(turn.trace.traceId, "step", step.span.spanId)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : props.search?.trim() ? (
        <p className="px-1 text-xs text-muted-foreground">
          No execution steps match &ldquo;{props.search}&rdquo;.
        </p>
      ) : null}

      {turn.assistantOutput ? (
        <ThreadBubble
          icon={<Bot />}
          label="Output"
          selected={outputSelected}
          spanName={turn.assistantOutput.spanName}
          text={turn.assistantOutput.text}
          tone="default"
          onSelect={() => {
            const targetSpanId = turn.assistantOutput?.spanId || firstSpanId;
            if (targetSpanId) props.onSelectSlot(turn.trace.traceId, "output", targetSpanId);
          }}
        />
      ) : null}

      {!turn.userInput && !turn.assistantOutput && steps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No input, output, or step payloads captured for this trace.
        </div>
      ) : null}
    </article>
  );
}

/**
 * Compact, scannable node used in the left TraceNavigator pane.
 * Clamps long prompts to 3 lines and renders structured JSON outputs as crisp key-value rows
 * instead of dumping walls of raw text or minified JSON into the narrow sidebar.
 */
function CompactTrajectoryNode(props: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  spanName?: string;
  text: string;
  onSelect: () => void;
}) {
  const structured = extractStructuredPreviewFields(props.text, 3);
  return (
    <button
      type="button"
      className={cn(
        "grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.selected
          ? "border-border-strong bg-row-active"
          : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40",
      )}
      onClick={props.onSelect}
    >
      <span className="row-span-2 grid size-6 shrink-0 place-items-center rounded bg-background text-muted-foreground ring-1 ring-border/60 [&_svg]:size-3.5">
        {props.icon}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="shrink-0 text-xs font-semibold text-foreground">{props.label}</span>
        {props.spanName ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{props.spanName}</span>
        ) : null}
      </div>
      <div className="min-w-0 overflow-hidden">
        {structured ? (
          <dl className="m-0 grid min-w-0 grid-cols-1 gap-0.5">
            {structured.map((field) => (
              <div
                key={field.key}
                className="grid min-w-0 grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] gap-2 text-xs leading-4"
              >
                <dt className="truncate font-mono text-muted-foreground">{field.key}</dt>
                <dd className="m-0 truncate text-foreground/90">{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="m-0 line-clamp-3 min-w-0 break-words [overflow-wrap:anywhere] text-xs leading-4.5 text-muted-foreground">
            {props.text}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Full-width readable conversation block used in Thread view.
 * Renders Markdown for prose, clean key-value fields for structured JSON,
 * and collapses very long prompts with an inline Show more/less toggle.
 */
function ThreadBubble(props: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  spanName?: string;
  text: string;
  tone: "muted" | "default";
  onSelect: () => void;
}) {
  const structured = extractStructuredPreviewFields(props.text, 6);
  const isLong = !structured && (props.text.length > 480 || props.text.split("\n").length > 8);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "grid w-full min-w-0 max-w-full cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-hidden rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.selected
          ? "border-border-strong bg-row-active/70"
          : props.tone === "muted"
            ? "border-border/70 bg-muted/20 hover:border-border hover:bg-muted/35"
            : "border-border/70 bg-card/30 hover:border-border hover:bg-muted/25",
      )}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
    >
      <span className="row-span-2 grid size-7 shrink-0 place-items-center rounded-md bg-background text-muted-foreground ring-1 ring-border/60 [&_svg]:size-3.5">
        {props.icon}
      </span>
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs font-medium">
        <span className="shrink-0">{props.label}</span>
        {props.spanName ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{props.spanName}</span>
        ) : null}
      </div>
      <div className="min-w-0 max-w-full overflow-hidden">
        {structured ? (
          <dl className="m-0 grid min-w-0 grid-cols-1 divide-y divide-border/40">
            {structured.map((field) => (
              <div
                key={field.key}
                className="grid min-w-0 grid-cols-[minmax(6rem,0.24fr)_minmax(0,1fr)] gap-3 py-1.5 text-xs leading-5 first:pt-0 last:pb-0"
              >
                <dt className="break-all font-mono text-muted-foreground">{field.key}</dt>
                <dd className="m-0 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/95">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : looksLikeJsonPreview(props.text) ? (
          <p className="m-0 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5 text-foreground/90">
            {props.text}
          </p>
        ) : (
          <div className="relative min-w-0">
            <div className={cn(isLong && !expanded && "max-h-48 overflow-hidden")}>
              <MarkdownContent content={props.text} />
            </div>
            {isLong && !expanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/95 to-transparent" />
            ) : null}
            {isLong ? (
              <button
                type="button"
                className="relative mt-1.5 text-xs font-medium text-primary hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((current) => !current);
                }}
              >
                {expanded ? "Show less" : "Show full message"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
