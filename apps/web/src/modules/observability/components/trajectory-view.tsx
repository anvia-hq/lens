import { Button, buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import {
  ChevronRight,
  ExternalLink,
  Message as MessageCircle,
  Microchip as Bot,
  User,
} from "@mynaui/icons-react";
import type { TraceSummary } from "@lens/contracts";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode, useState } from "react";
import { extractStructuredPreviewFields } from "../utils/preview-format";
import { formatCost, formatDuration, formatNumber, formatTimestamp } from "../utils/session";
import {
  filterTrajectorySteps,
  type TrajectoryMessage,
  type TrajectoryTurn,
} from "../utils/trajectory";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { StatusPill } from "./status-pill";
import { RailDot, RailIcon, RailRow } from "./trajectory-rail";
import { TrajectoryStepRow } from "./trajectory-step-row";

type ActiveAnchor = {
  traceId: string;
  slot: "input" | "output" | "step";
  spanId: string;
};

type Mode = "trace" | "thread";

export function TrajectoryView(props: {
  turns: TrajectoryTurn[];
  projectId: string;
  mode: Mode;
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
        <div className="grid max-w-sm gap-1.5">
          <MessageCircle className="mx-auto size-6 text-muted-foreground" />
          <span className="text-base font-medium">No trajectory data captured</span>
          <span className="text-sm text-muted-foreground">
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
        <div className="flex justify-center p-4">
          <Button
            variant="outline"
            size="sm"
            disabled={props.isLoadingMore}
            onClick={props.onLoadMore}
          >
            {props.isLoadingMore ? "Loading more…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type RailItem = { key: string; render: (first: boolean, last: boolean) => ReactNode };

function TrajectoryTurnBlock(props: {
  activeAnchor: ActiveAnchor | null;
  index: number;
  mode: Mode;
  projectId: string;
  search?: string;
  selectedSpanId?: string;
  selectedTraceId?: string;
  turn: TrajectoryTurn;
  onSelectSlot: (traceId: string, slot: ActiveAnchor["slot"], spanId: string) => void;
}) {
  const { turn } = props;
  const traceId = turn.trace.traceId;
  const steps = props.search ? filterTrajectorySteps(turn.steps, props.search) : turn.steps;
  const turnSelected = props.selectedTraceId === undefined || props.selectedTraceId === traceId;
  const firstSpanId = turn.allSpans[0]?.spanId;
  const [stepsOpen, setStepsOpen] = useState(
    () =>
      props.mode === "trace" ||
      steps.length <= 4 ||
      steps.some((step) => step.span.status === "error"),
  );

  // Input and output often map to the same root span; only highlight the slot that was clicked.
  const sameRootSpan =
    Boolean(turn.userInput?.spanId) && turn.userInput?.spanId === turn.assistantOutput?.spanId;
  const anchorMatchesTurn =
    props.activeAnchor?.traceId === traceId && props.activeAnchor.spanId === props.selectedSpanId;
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

  const selectMessage = (slot: "input" | "output", message: TrajectoryMessage) => () => {
    const spanId = message.spanId || firstSpanId;
    if (spanId) props.onSelectSlot(traceId, slot, spanId);
  };
  const maxDurationMs = Math.max(0, ...steps.map((step) => step.durationMs));
  const totalTokens = steps.reduce((sum, step) => sum + step.span.totalTokens, 0);

  const items: RailItem[] = [];
  const userInput = turn.userInput;
  if (userInput) {
    items.push({
      key: "input",
      render: (first, last) => (
        <MessageRow
          first={first}
          last={last}
          icon={<User />}
          label="Input"
          message={userInput}
          mode={props.mode}
          selected={inputSelected}
          onSelect={selectMessage("input", userInput)}
        />
      ),
    });
  }
  if (steps.length > 0 && props.mode === "thread") {
    items.push({
      key: "steps",
      render: (first, last) => (
        <RailRow first={first} last={last && !stepsOpen} marker={<RailDot />}>
          <button
            type="button"
            aria-expanded={stepsOpen}
            className="flex h-5 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setStepsOpen((open) => !open)}
          >
            <span>
              {formatNumber(steps.length)} {steps.length === 1 ? "step" : "steps"}
              {totalTokens > 0 ? ` · ${formatNumber(totalTokens)} tok` : ""}
            </span>
            <ChevronRight
              className={cn("size-3.5 transition-transform", stepsOpen && "rotate-90")}
            />
          </button>
        </RailRow>
      ),
    });
  }
  if (stepsOpen) {
    for (const step of steps) {
      items.push({
        key: step.span.spanId,
        render: (_first, last) => (
          <TrajectoryStepRow
            last={last}
            maxDurationMs={maxDurationMs}
            step={step}
            selected={turnSelected && props.selectedSpanId === step.span.spanId}
            onSelect={() => props.onSelectSlot(traceId, "step", step.span.spanId)}
          />
        ),
      });
    }
  }
  const assistantOutput = turn.assistantOutput;
  if (assistantOutput) {
    items.push({
      key: "output",
      render: (first, last) => (
        <MessageRow
          first={first}
          last={last}
          icon={<Bot />}
          label="Output"
          message={assistantOutput}
          mode={props.mode}
          selected={outputSelected}
          onSelect={selectMessage("output", assistantOutput)}
        />
      ),
    });
  }

  const body = (
    <>
      {items.length > 0 ? (
        <ol className="@container grid min-w-0 grid-cols-1 p-2">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.render(index === 0, index === items.length - 1)}
            </Fragment>
          ))}
        </ol>
      ) : null}
      {steps.length === 0 && props.search?.trim() ? (
        <p className="px-4 pb-3 text-sm text-muted-foreground">
          No steps match &ldquo;{props.search}&rdquo;.
        </p>
      ) : null}
      {items.length === 0 && !props.search?.trim() ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          No input, output, or step payloads captured for this trace.
        </p>
      ) : null}
    </>
  );

  if (props.mode === "trace") return <article className="min-w-0">{body}</article>;

  return (
    <article className="min-w-0 border-b last:border-b-0">
      <TurnHeader index={props.index} projectId={props.projectId} trace={turn.trace} />
      {body}
    </article>
  );
}

/** Sticky per-turn heading shared by the thread's Trajectory and Traces modes. */
export function TurnHeader(props: { index: number; projectId: string; trace: TraceSummary }) {
  const { trace } = props;
  return (
    <header className="sticky top-0 z-20 flex h-10 items-center gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur">
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        Turn {props.index + 1}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{trace.name}</span>
      {trace.status === "error" || trace.status === "running" ? (
        <StatusPill status={trace.status} />
      ) : null}
      <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
        {formatTimestamp(trace.startedAt)} · {formatDuration(trace.durationMs)}
        {trace.totalCost !== null ? ` · ${formatCost(trace.totalCost)}` : ""}
      </span>
      <Link
        aria-label={`Open trace ${trace.name}`}
        title="Open trace"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "-mr-2 ml-auto sm:ml-0",
        )}
        to="/$projectId/traces/$traceId"
        params={{ projectId: props.projectId, traceId: trace.traceId }}
      >
        <ExternalLink />
      </Link>
    </header>
  );
}

/**
 * Input or output on the rail. In the narrow trace pane text is clamped; in thread view it is
 * rendered as Markdown with a Show more toggle for long messages.
 */
function MessageRow(props: {
  first: boolean;
  last: boolean;
  icon: ReactNode;
  label: string;
  message: TrajectoryMessage;
  mode: Mode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <RailRow
      first={props.first}
      last={props.last}
      marker={<RailIcon>{props.icon}</RailIcon>}
      selected={props.selected}
      onSelect={props.onSelect}
    >
      <button
        type="button"
        className="flex h-5 min-w-0 max-w-full items-center gap-2 text-left text-xs outline-none focus-visible:underline"
        title={props.message.spanName}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelect();
        }}
      >
        <span className="shrink-0 font-medium text-muted-foreground">{props.label}</span>
      </button>
      <MessageBody text={props.message.text} mode={props.mode} />
    </RailRow>
  );
}

function MessageBody(props: { text: string; mode: Mode }) {
  const compact = props.mode === "trace";
  const structured = extractStructuredPreviewFields(props.text, compact ? 4 : 8);
  const isLong =
    !compact && !structured && (props.text.length > 600 || props.text.split("\n").length > 10);
  const [expanded, setExpanded] = useState(false);

  if (structured) {
    return (
      <dl className="m-0 mt-0.5 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
        {structured.map((field) => (
          <div key={field.key} className="contents">
            <dt className="font-mono text-xs leading-5 text-muted-foreground">{field.key}</dt>
            <dd
              className={cn(
                "m-0 min-w-0 break-words [overflow-wrap:anywhere]",
                compact ? "truncate" : "whitespace-pre-wrap",
              )}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (looksLikeJsonPreview(props.text)) {
    return (
      <p
        className={cn(
          "m-0 mt-0.5 min-w-0 font-mono text-xs leading-5 break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
          compact && "line-clamp-4",
        )}
      >
        {props.text}
      </p>
    );
  }
  if (compact) {
    return (
      <p className="m-0 mt-0.5 line-clamp-4 min-w-0 text-sm break-words [overflow-wrap:anywhere]">
        {props.text}
      </p>
    );
  }
  return (
    <div className="mt-0.5 min-w-0">
      <div className={cn(isLong && !expanded && "max-h-48 overflow-hidden mask-b-from-60%")}>
        <MarkdownContent className="text-sm" content={props.text} />
      </div>
      {isLong ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
