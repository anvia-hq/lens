import type { SessionSummary } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";

export function SessionStatusBadge({ summary }: { summary: Pick<SessionSummary, "status"> }) {
  const label = summary.status === "error" ? "Error" : "Success";

  return <Badge variant={summary.status === "error" ? "destructive" : "secondary"}>{label}</Badge>;
}
