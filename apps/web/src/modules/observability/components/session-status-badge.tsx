import type { SessionSummary } from "@lens/contracts";
import { StatusBadge } from "./status-badge";

export function SessionStatusBadge({ summary }: { summary: Pick<SessionSummary, "status"> }) {
  return (
    <StatusBadge
      status={
        summary.status === "error" ? "error" : summary.status === "running" ? "running" : "ok"
      }
    />
  );
}
