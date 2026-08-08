import type { EvaluationRunStatus } from "@lens/contracts";
import { SemanticStatusBadge, type SemanticStatusTone } from "./status-badge";

const statusTone: Record<EvaluationRunStatus, SemanticStatusTone> = {
  completed: "success",
  failed: "error",
  running: "warning",
};

export function EvaluationRunStatusBadge({ status }: { status: EvaluationRunStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <SemanticStatusBadge tone={statusTone[status]}>{label}</SemanticStatusBadge>;
}
