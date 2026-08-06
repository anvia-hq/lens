import { cn } from "@lens/ui/lib/utils";
import type { ReactNode } from "react";

export function FullPageMessage(props: { icon: ReactNode; text: string; contained?: boolean }) {
  return (
    <div
      className={cn("flex items-center justify-center", props.contained ? "min-h-96" : "min-h-svh")}
    >
      <div className="grid justify-items-center gap-3 text-muted-foreground">
        <span className="animate-pulse">{props.icon}</span>
        <p className="text-sm">{props.text}</p>
      </div>
    </div>
  );
}
