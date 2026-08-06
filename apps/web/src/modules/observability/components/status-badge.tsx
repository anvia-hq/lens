import { Badge } from "@lens/ui/components/badge";

export function StatusBadge({ status }: { status: "ok" | "error" | "unset" }) {
  const label = status === "ok" ? "Success" : status === "error" ? "Error" : "Unset";
  const className =
    status === "ok"
      ? "border-0 bg-emerald-200 text-emerald-950 dark:bg-emerald-300 dark:text-emerald-950"
      : status === "error"
        ? "border-0 bg-rose-200 text-rose-950 dark:bg-rose-300 dark:text-rose-950"
        : "border-0 bg-slate-200 text-slate-900 dark:bg-slate-300 dark:text-slate-950";

  return (
    <Badge variant="ghost" className={className}>
      {label}
    </Badge>
  );
}
