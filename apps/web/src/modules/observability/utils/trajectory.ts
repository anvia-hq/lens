import type { SessionTurnPayload, TraceSpanSummary, TraceSummary } from "@lens/contracts";
import { extractSessionMessageText } from "./session";
import { buildSpanForest, flattenSpanForest, spanDurationMs } from "./trace-detail";

export type TrajectoryMessage = {
  text: string;
  spanId: string;
  spanName: string;
};

export type TrajectoryStep = {
  span: TraceSpanSummary;
  depth: number;
  durationMs: number;
};

export type TrajectoryTurn = {
  trace: TraceSummary;
  userInput: TrajectoryMessage | null;
  assistantOutput: TrajectoryMessage | null;
  steps: TrajectoryStep[];
  allSpans: TraceSpanSummary[];
};

export function buildTrajectoryTurn(input: {
  trace: TraceSummary;
  spans: TraceSpanSummary[];
  prompt?: SessionTurnPayload | null;
  response?: SessionTurnPayload | null;
}): TrajectoryTurn {
  const forest = buildSpanForest(input.spans);
  const flat = flattenSpanForest(forest);
  const ordered = flat.map((row) => row.span);

  const rootWithInput = ordered.find(
    (span) => span.parentSpanId === null && hasPreview(span.inputPreview),
  );
  const firstWithInput = ordered.find((span) => hasPreview(span.inputPreview));
  const inputSource = rootWithInput ?? firstWithInput;

  const userInput: TrajectoryMessage | null = input.prompt
    ? {
        text: extractSessionMessageText(input.prompt.value, "user"),
        spanId: input.prompt.spanId,
        spanName: input.prompt.spanName,
      }
    : inputSource?.inputPreview
      ? {
          text: inputSource.inputPreview,
          spanId: inputSource.spanId,
          spanName: inputSource.name,
        }
      : input.trace.inputPreview
        ? {
            text: input.trace.inputPreview,
            spanId: ordered[0]?.spanId ?? "",
            spanName: ordered[0]?.name ?? input.trace.name,
          }
        : null;

  const rootWithOutput = [...ordered]
    .reverse()
    .find((span) => span.parentSpanId === null && hasPreview(span.outputPreview));
  const lastNonToolOutput = [...ordered]
    .reverse()
    .find(
      (span) =>
        hasPreview(span.outputPreview) &&
        span.observationKind !== "tool" &&
        span.observationKind !== "event",
    );
  const lastWithOutput = [...ordered].reverse().find((span) => hasPreview(span.outputPreview));
  const outputSource = rootWithOutput ?? lastNonToolOutput ?? lastWithOutput;

  const assistantOutput: TrajectoryMessage | null = input.response
    ? {
        text: extractSessionMessageText(input.response.value, "assistant"),
        spanId: input.response.spanId,
        spanName: input.response.spanName,
      }
    : outputSource?.outputPreview
      ? {
          text: outputSource.outputPreview,
          spanId: outputSource.spanId,
          spanName: outputSource.name,
        }
      : input.trace.outputPreview
        ? {
            text: input.trace.outputPreview,
            spanId: ordered.at(-1)?.spanId ?? "",
            spanName: ordered.at(-1)?.name ?? input.trace.name,
          }
        : null;

  // Exclude a single pure-wrapper root span when children already describe the execution steps,
  // unless the root itself errored or has no children.
  const hasChildren = flat.some((row) => row.depth > 0);
  const steps: TrajectoryStep[] = flat
    .filter((row) => {
      if (!hasChildren) return true;
      if (row.depth > 0) return true;
      if (row.span.status === "error") return true;
      if (row.span.observationKind === "generation" || row.span.observationKind === "tool") {
        return true;
      }
      return false;
    })
    .map((row) => ({
      span: row.span,
      depth: hasChildren ? Math.max(0, row.depth - 1) : 0,
      durationMs: spanDurationMs(row.span),
    }));

  return {
    trace: input.trace,
    userInput: userInput && userInput.text.trim().length > 0 ? userInput : null,
    assistantOutput:
      assistantOutput && assistantOutput.text.trim().length > 0 ? assistantOutput : null,
    steps,
    allSpans: ordered,
  };
}

export function filterTrajectorySteps(steps: TrajectoryStep[], query: string): TrajectoryStep[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return steps;
  return steps.filter(({ span }) =>
    [
      span.name,
      span.observationKind,
      span.model,
      span.serviceName,
      span.spanId,
      span.inputPreview,
      span.outputPreview,
      span.statusMessage,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .some((value) => value.toLowerCase().includes(normalized)),
  );
}

function hasPreview(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
