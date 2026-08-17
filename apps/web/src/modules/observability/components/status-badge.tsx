import type { TraceStatus } from "@lens/contracts";
import { SemanticStatusBadge } from "../../../components/semantic-status-badge";

export {
  SemanticStatusBadge,
  type SemanticStatusTone,
} from "../../../components/semantic-status-badge";

export function StatusBadge({ status }: { status: TraceStatus }) {
  const label =
    status === "running"
      ? "Running"
      : status === "ok"
        ? "Success"
        : status === "error"
          ? "Error"
          : "Unset";
  const tone =
    status === "running"
      ? "warning"
      : status === "ok"
        ? "success"
        : status === "error"
          ? "error"
          : "neutral";
  return <SemanticStatusBadge tone={tone}>{label}</SemanticStatusBadge>;
}
