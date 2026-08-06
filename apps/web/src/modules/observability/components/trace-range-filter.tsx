import { Input } from "@lens/ui/components/input";

export function TraceRangeFilter(props: {
  label: string;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  step?: string;
  onCommit: (minimum: number | undefined, maximum: number | undefined) => void;
}) {
  const commit = (container: HTMLFieldSetElement) => {
    const values = Array.from(container.querySelectorAll("input")).map((input) =>
      input.value.length === 0 ? undefined : Number(input.value),
    );
    props.onCommit(values[0], values[1]);
  };
  return (
    <fieldset
      key={`${props.minimum ?? ""}-${props.maximum ?? ""}`}
      className="grid gap-1.5 text-xs font-medium"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) commit(event.currentTarget);
      }}
    >
      <legend>{props.label}</legend>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Input
          type="number"
          min="0"
          step={props.step ?? (props.integer ? "1" : "any")}
          defaultValue={props.minimum}
          placeholder="Min"
        />
        <span className="text-muted-foreground">to</span>
        <Input
          type="number"
          min="0"
          step={props.step ?? (props.integer ? "1" : "any")}
          defaultValue={props.maximum}
          placeholder="Max"
        />
      </div>
    </fieldset>
  );
}
