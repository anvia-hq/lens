import type { SpanDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";

export function StatusPill({ status }: { status: SpanDetail["status"] }) {
  const label = status === "ok" ? "Success" : status === "error" ? "Error" : "Unset";
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {label}
    </Badge>
  );
}
