import type { ObservationKind } from "@lens/contracts";
import {
  Pulse as Activity,
  Robot as Bot,
  DotOutline as CircleDot,
  ShieldCheckered as ShieldCheck,
  Sparkle as Sparkles,
  Wrench,
} from "@phosphor-icons/react";

export function observationIcon(kind: ObservationKind) {
  if (kind === "generation" || kind === "embedding") return Sparkles;
  if (kind === "tool") return Wrench;
  if (kind === "agent" || kind === "chain") return Bot;
  if (kind === "evaluator" || kind === "guardrail") return ShieldCheck;
  if (kind === "event") return Activity;
  return CircleDot;
}
