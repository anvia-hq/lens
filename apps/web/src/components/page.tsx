import { cn } from "@lens/ui/lib/utils";
import type { ReactNode } from "react";

export function Page(props: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={cn("flex w-full flex-1 flex-col gap-6 p-4 md:p-6", props.className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Observability
          </p>
          <h1 className="font-heading text-2xl font-medium tracking-tight">{props.title}</h1>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
        {props.action}
      </header>
      {props.children}
    </main>
  );
}
