import { Button } from "@lens/ui/components/button";
import type { UserRange } from "../types";

const ranges: UserRange[] = ["all", "24h", "7d", "30d"];

export function UserRangeSelector(props: {
  value: UserRange;
  onChange: (range: UserRange) => void;
}) {
  return (
    <fieldset
      className="flex h-8 rounded-md border bg-background p-px"
      aria-label="User time range"
    >
      {ranges.map((range) => (
        <Button
          key={range}
          type="button"
          size="sm"
          variant={props.value === range ? "secondary" : "ghost"}
          className="h-7 px-2.5"
          aria-pressed={props.value === range}
          onClick={() => props.onChange(range)}
        >
          {range === "all" ? "All" : range}
        </Button>
      ))}
    </fieldset>
  );
}
