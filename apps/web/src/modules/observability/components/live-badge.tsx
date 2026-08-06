import { Button } from "@lens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@lens/ui/components/dropdown-menu";
import { Check, CaretDown as ChevronDown, ArrowClockwise as Refresh } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { RefreshInterval } from "../types";

export function LiveBadge(props: {
  interval: RefreshInterval;
  onIntervalChange: (interval: RefreshInterval) => void;
}) {
  const queryClient = useQueryClient();
  const autoRefreshEnabled = props.interval !== "Off";

  return (
    <div className="flex h-8 items-center rounded-md border bg-background p-px">
      <Button
        className="size-7"
        variant="ghost"
        size="icon-sm"
        onClick={() => void queryClient.invalidateQueries()}
        title="Refresh now"
        aria-label="Refresh now"
      >
        <Refresh />
      </Button>
      <span className="mx-px h-4 w-px bg-border" aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button className="h-7 gap-2 px-2" variant="ghost" size="sm" />}
          aria-label="Refresh interval"
        >
          <span
            className={
              autoRefreshEnabled
                ? "size-1.5 rounded-full bg-emerald-500"
                : "size-1.5 rounded-full bg-muted-foreground/50"
            }
            aria-hidden="true"
          />
          <span>{autoRefreshEnabled ? `Every ${props.interval}` : "Auto refresh off"}</span>
          <ChevronDown className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Refresh interval</DropdownMenuLabel>
            {(["5s", "10s", "30s", "Off"] satisfies RefreshInterval[]).map((value) => (
              <DropdownMenuItem key={value} onClick={() => props.onIntervalChange(value)}>
                {value === "Off" ? "Auto refresh off" : `Every ${value}`}
                {props.interval === value ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
