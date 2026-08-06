import { Input } from "@lens/ui/components/input";
import { useId } from "react";

export function CommittedFilterInput(props: {
  label: string;
  value?: string;
  placeholder: string;
  onCommit: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5 text-xs font-medium">
      <label htmlFor={id}>{props.label}</label>
      <Input
        id={id}
        key={props.value ?? ""}
        defaultValue={props.value ?? ""}
        placeholder={props.placeholder}
        onBlur={(event) => props.onCommit(event.target.value.trim() || undefined)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </div>
  );
}
