import type { SpanDetail } from "@lens/contracts";
import {
  Activity,
  Check,
  LayersThree as Layers3,
  Search,
  Sparkles,
  Users,
  Zap,
} from "@mynaui/icons-react";

export function ObservationIcon({ kind }: { kind: SpanDetail["observationKind"] }) {
  const Icon =
    kind === "generation" || kind === "embedding"
      ? Sparkles
      : kind === "tool"
        ? Zap
        : kind === "agent" || kind === "chain"
          ? Users
          : kind === "retriever"
            ? Search
            : kind === "evaluator" || kind === "guardrail"
              ? Check
              : kind === "event"
                ? Activity
                : Layers3;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
      <Icon className="size-4" />
    </span>
  );
}
