import { Badge } from "@lens/ui/components/badge";
import { labelText } from "../utils/trace-detail";

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant={role === "tool" ? "destructive" : role === "assistant" ? "secondary" : "outline"}
    >
      {labelText(role)}
    </Badge>
  );
}
