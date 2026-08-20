import type { JsonValue } from "@lens/contracts";
import { useMemo } from "react";
import type { TracePayloadView } from "../types";
import { rawTraceJson } from "../utils/trace-detail";
import { FormattedPayload } from "./formatted-payload";
import { LARGE_PAYLOAD_PREVIEW_CHARACTERS, LargePayloadBlock } from "./large-payload-block";
import { RawJsonBlock } from "./raw-json-block";
import { SectionTitle } from "./section-title";

export function PayloadSection(props: {
  title: string;
  value: JsonValue | Record<string, unknown> | null;
  view: TracePayloadView;
}) {
  const serialized = useMemo(
    () =>
      props.value === null || props.value === undefined ? undefined : rawTraceJson(props.value),
    [props.value],
  );
  return (
    <section className="grid min-w-0 gap-3">
      <SectionTitle title={props.title} />
      {props.value === null || props.value === undefined ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No data captured
        </div>
      ) : serialized !== undefined && serialized.length > LARGE_PAYLOAD_PREVIEW_CHARACTERS ? (
        <LargePayloadBlock json={serialized} title={props.title} />
      ) : props.view === "json" ? (
        <RawJsonBlock title={props.title} value={props.value} />
      ) : (
        <FormattedPayload title={props.title} value={props.value} />
      )}
    </section>
  );
}
