import { Badge } from "@lens/ui/components/badge";

export function CompactValues({ values }: { values: string[] }) {
  if (values.length === 0) return "—";
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline">{values[0]}</Badge>
      {values.length > 1 ? (
        <span className="text-xs text-muted-foreground">+{values.length - 1}</span>
      ) : null}
    </div>
  );
}
