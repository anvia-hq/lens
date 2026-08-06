import { Button } from "@lens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lens/ui/components/dropdown-menu";
import { CaretDown as ChevronDown, ArrowClockwise as Refresh } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { RefreshInterval } from "../types";

export function LiveBadge(props: {
  interval: RefreshInterval;
  onIntervalChange: (interval: RefreshInterval) => void;
}) {
  const queryClient = useQueryClient();

  return (
    <div className="flex items-center">
      <Button
        className="h-8 rounded-r-none border-r-0"
        variant="outline"
        size="sm"
        onClick={() => void queryClient.invalidateQueries()}
        title="Refresh now"
      >
        <Refresh />
        <span className="size-2 rounded-full bg-primary" />
        {props.interval === "Off" ? "Manual" : `Live · ${props.interval}`}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="h-8 rounded-l-none border-border px-1.5"
              variant="outline"
              size="sm"
            />
          }
          aria-label="Refresh interval"
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-28">
          {(["5s", "10s", "30s", "Off"] satisfies RefreshInterval[]).map((value) => (
            <DropdownMenuItem key={value} onClick={() => props.onIntervalChange(value)}>
              {value === "Off" ? "Auto refresh off" : `Every ${value}`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
