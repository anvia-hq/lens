import { Badge } from "@lens/ui/components/badge";

export function MetadataValues({ label, values }: { label: string; values: string[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <Badge className="max-w-full truncate" key={value} title={value} variant="outline">
              {value}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </section>
  );
}
