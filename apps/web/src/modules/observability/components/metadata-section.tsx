import type { ReactNode } from "react";

export function MetadataSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="grid gap-2.5 text-xs">{children}</dl>
    </section>
  );
}
