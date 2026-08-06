export function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-20 gap-0.5 rounded-md border bg-muted/20 px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs font-medium">{value}</span>
    </div>
  );
}
