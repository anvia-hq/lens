import type { EvaluationResult } from "@lens/contracts";
import { SemanticStatusBadge, type SemanticStatusTone } from "./status-badge";

type EvaluationStatus = EvaluationResult["outcome"] | "insufficient_data";

const statusPresentation: Record<EvaluationStatus, { label: string; tone: SemanticStatusTone }> = {
  pass: { label: "Pass", tone: "success" },
  fail: { label: "Fail", tone: "error" },
  invalid: { label: "Invalid", tone: "warning" },
  unknown: { label: "Unknown", tone: "neutral" },
  insufficient_data: { label: "Insufficient data", tone: "neutral" },
};

export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  const presentation = statusPresentation[status];
  return <SemanticStatusBadge tone={presentation.tone}>{presentation.label}</SemanticStatusBadge>;
}
