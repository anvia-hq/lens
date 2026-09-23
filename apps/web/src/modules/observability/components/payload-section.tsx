import type { JsonValue } from "@lens/contracts";
import { SpanPayloadSection } from "./span-payload-section";

export function PayloadSection(props: {
  title: string;
  value: JsonValue | Record<string, unknown> | null;
}) {
  return (
    <SpanPayloadSection
      field={props.title === "Output" ? "output" : "input"}
      title={props.title}
      value={props.value}
    />
  );
}
