import type { ObservationKind } from "@lens/contracts";
import { Activity, Bot, CircleDot, ShieldCheck, Sparkles, Wrench } from "lucide-react";

export function observationIcon(kind: ObservationKind) {
  if (kind === "generation" || kind === "embedding") return Sparkles;
  if (kind === "tool") return Wrench;
  if (kind === "agent" || kind === "chain") return Bot;
  if (kind === "evaluator" || kind === "guardrail") return ShieldCheck;
  if (kind === "event") return Activity;
  return CircleDot;
}
