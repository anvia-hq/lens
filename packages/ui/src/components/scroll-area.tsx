import { cn } from "@lens/ui/lib/utils";
import type * as React from "react";

/**
 * A native scroll container. It deliberately uses the browser scrollbar so it picks up the global
 * scrollbar styling in globals.css instead of drawing a second, different scrollbar.
 */
function ScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="scroll-area" className={cn("relative overflow-auto", className)} {...props}>
      {children}
    </div>
  );
}

export { ScrollArea };
