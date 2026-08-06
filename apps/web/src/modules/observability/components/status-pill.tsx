import type { SpanDetail } from "@lens/contracts";
import { StatusBadge } from "./status-badge";

export function StatusPill({ status }: { status: SpanDetail["status"] }) {
  return <StatusBadge status={status} />;
}
