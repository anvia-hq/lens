import type { SpanDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";

export function StatusPill({ status }: { status: SpanDetail["status"] }) {
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {status === "ok" ? "Success" : status === "error" ? "Error" : "Unset"}
    </Badge>
  );
}
