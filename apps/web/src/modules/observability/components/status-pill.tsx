import type { TraceStatus } from "@lens/contracts";
import { StatusBadge } from "./status-badge";

export function StatusPill({ status }: { status: TraceStatus }) {
  return <StatusBadge status={status} />;
}
