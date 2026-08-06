import { Badge } from "@lens/ui/components/badge";

export function StatusBadge({ status }: { status: "ok" | "error" | "unset" }) {
  const label = status === "ok" ? "Success" : status === "error" ? "Error" : "Unset";
  return (
    <Badge variant={status === "error" ? "destructive" : status === "ok" ? "secondary" : "outline"}>
      {label}
    </Badge>
  );
}
