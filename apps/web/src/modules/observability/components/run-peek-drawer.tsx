import type { RunListItem, SpanDetail } from "@lens/contracts";
import { Button, buttonVariants } from "@lens/ui/components/button";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import { ArrowDown, ArrowUp, ExternalLink } from "@mynaui/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "../../../lib/api";
import { SpanInspectorState } from "./span-inspector-state";

export function RunPeekDrawer(props: {
  projectId: string;
  runs: RunListItem[];
  selected: { traceId: string; spanId: string } | null;
  onSelect: (target: { traceId: string; spanId: string } | null) => void;
}) {
  const open = props.selected !== null;
  const currentIndex = props.selected
    ? props.runs.findIndex(
        (item) =>
          item.traceId === props.selected?.traceId && item.spanId === props.selected?.spanId,
      )
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < props.runs.length - 1;

  const span = useQuery({
    queryKey: ["trace-span", props.projectId, props.selected?.traceId, props.selected?.spanId],
    queryFn: ({ signal }) =>
      api<SpanDetail>(
        `/api/v1/projects/${props.projectId}/traces/${props.selected?.traceId}/spans/${props.selected?.spanId}`,
        { signal },
      ),
    enabled: props.selected !== null,
    staleTime: 5 * 60 * 1_000,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "ArrowUp" && hasPrev) {
        event.preventDefault();
        const prev = props.runs[currentIndex - 1];
        if (prev) props.onSelect({ traceId: prev.traceId, spanId: prev.spanId });
      } else if (event.key === "ArrowDown" && hasNext) {
        event.preventDefault();
        const next = props.runs[currentIndex + 1];
        if (next) props.onSelect({ traceId: next.traceId, spanId: next.spanId });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, hasNext, hasPrev, open, props]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && props.onSelect(null)}>
      <SheetContent
        side="right"
        className="flex w-[min(48rem,94vw)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">Run details</SheetTitle>
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 pr-12">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous run"
              disabled={!hasPrev}
              onClick={() => {
                const prev = props.runs[currentIndex - 1];
                if (prev) props.onSelect({ traceId: prev.traceId, spanId: prev.spanId });
              }}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next run"
              disabled={!hasNext}
              onClick={() => {
                const next = props.runs[currentIndex + 1];
                if (next) props.onSelect({ traceId: next.traceId, spanId: next.spanId });
              }}
            >
              <ArrowDown />
            </Button>
          </div>
          {props.selected ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to="/$projectId/traces/$traceId"
              params={{ projectId: props.projectId, traceId: props.selected.traceId }}
              search={{ span: props.selected.spanId }}
            >
              Open in Trace <ExternalLink />
            </Link>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SpanInspectorState
            error={span.error}
            loading={span.isLoading}
            selectedSpanId={props.selected?.spanId}
            span={span.data}
            onRetry={() => void span.refetch()}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
