import { formattedPayloadRows } from "../utils/trace-detail";
import { RoleBadge } from "./role-badge";

export function FormattedPayload({ title, value }: { title: string; value: unknown }) {
  const rows = formattedPayloadRows(title, value);
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border px-4 py-4 text-sm text-muted-foreground">Empty value</div>
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <article
          className="grid min-w-0 gap-2 rounded-lg border bg-muted/10 px-4 py-3"
          key={row.key}
        >
          <div className="flex items-center gap-2">
            {row.role ? <RoleBadge role={row.role} /> : null}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.label}
            </span>
          </div>
          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{row.text}</p>
        </article>
      ))}
    </div>
  );
}
