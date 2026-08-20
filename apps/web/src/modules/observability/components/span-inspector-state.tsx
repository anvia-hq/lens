import type { SpanDetail } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Spinner } from "@lens/ui/components/spinner";
import type { TracePayloadView } from "../types";
import { EmptyInspector } from "./empty-inspector";
import { SpanInspector } from "./span-inspector";

export function SpanInspectorState(props: {
  error?: Error | null;
  loading: boolean;
  payloadView: TracePayloadView;
  selectedSpanId?: string;
  span?: SpanDetail;
  onPayloadViewChange: (view: TracePayloadView) => void;
  onRetry: () => void;
}) {
  if (props.selectedSpanId === undefined) return <EmptyInspector />;
  if (props.span !== undefined) {
    return (
      <SpanInspector
        payloadView={props.payloadView}
        span={props.span}
        onPayloadViewChange={props.onPayloadViewChange}
      />
    );
  }
  if (props.error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="grid max-w-sm gap-3">
          <p className="text-sm font-medium">Unable to load span data</p>
          <p className="text-xs text-muted-foreground">{props.error.message}</p>
          <Button className="mx-auto" size="sm" variant="outline" onClick={props.onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  if (props.loading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Spinner /> Loading span data
        </span>
      </div>
    );
  }
  return <EmptyInspector />;
}
