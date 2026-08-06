import type { MetricsRangePreset } from "@lens/contracts";
import { metricsRangePresets } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";

export function RangeSelector(props: {
  value: MetricsRangePreset;
  onChange: (range: MetricsRangePreset) => void;
}) {
  return (
    <fieldset
      className="flex rounded-md border bg-background p-0.5"
      aria-label="Overview time range"
    >
      {metricsRangePresets.map((range) => (
        <Button
          key={range}
          type="button"
          size="sm"
          variant={props.value === range ? "secondary" : "ghost"}
          className="h-7 px-2.5"
          aria-pressed={props.value === range}
          onClick={() => props.onChange(range)}
        >
          {range}
        </Button>
      ))}
    </fieldset>
  );
}
