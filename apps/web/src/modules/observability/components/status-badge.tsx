import { Badge } from "@lens/ui/components/badge";

export function StatusBadge({ status }: { status: "ok" | "error" | "unset" }) {
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {status === "ok" ? "Success" : status === "error" ? "Error" : "Unset"}
    </Badge>
  );
}
