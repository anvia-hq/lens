import { Button } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "@mynaui/icons-react";

/**
 * Sortable table header. The active column shows its direction (up = ascending, down =
 * descending); inactive columns show a faint two-way arrow that strengthens on hover.
 */
export function SortHeaderButton(props: {
  label: string;
  active: boolean;
  order?: "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = !props.active ? ArrowUpDown : props.order === "asc" ? ArrowUp : ArrowDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("group/sort -ml-3", props.active && "text-foreground")}
      onClick={props.onClick}
      aria-label={`Sort by ${props.label}${props.active && props.order ? `, currently ${props.order}` : ""}`}
    >
      {props.label}
      <Icon
        aria-hidden
        className={cn(
          !props.active &&
            "text-muted-foreground opacity-40 transition-opacity group-hover/sort:opacity-100",
        )}
      />
    </Button>
  );
}
