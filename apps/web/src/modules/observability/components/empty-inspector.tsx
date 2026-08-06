import { DotOutline as CircleDot } from "@phosphor-icons/react";

export function EmptyInspector() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="grid max-w-sm gap-2">
        <CircleDot className="mx-auto size-8 text-muted-foreground" />
        <span className="text-sm font-medium">No span selected</span>
        <span className="text-xs text-muted-foreground">
          Select a span from the tree or timeline to inspect its data.
        </span>
      </div>
    </div>
  );
}
