import type { ObservationKind } from "@lens/contracts";
import {
  Activity,
  Microchip as Bot,
  Record as CircleDot,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "@mynaui/icons-react";

export function observationIcon(kind: ObservationKind) {
  if (kind === "generation" || kind === "embedding") return Sparkles;
  if (kind === "tool") return Wrench;
  if (kind === "agent" || kind === "chain") return Bot;
  if (kind === "evaluator" || kind === "guardrail") return ShieldCheck;
  if (kind === "event") return Activity;
  return CircleDot;
}
