import type { SpanDetail, TraceDetail } from "@lens/contracts";
import { cn } from "@lens/ui/lib/utils";
import type { SpanTreeNode, TraceSpanView } from "../types";
import { SpanInspectorState } from "./span-inspector-state";
import { TraceNavigator } from "./trace-navigator";

export function MobileTraceLayout(props: {
  activeTab: TraceSpanView | "data";
  collapsed: Set<string>;
  detail: TraceDetail;
  forest: SpanTreeNode[];
  projectId?: string;
  search: string;
  selectedSpan?: SpanDetail;
  selectedSpanError?: Error | null;
  selectedSpanLoading?: boolean;
  selectedSpanId?: string;
  onCollapsedChange: (value: Set<string>) => void;
  onSearchChange: (value: string) => void;
  onSelectSpan: (id: string) => void;
  onRetrySelectedSpan?: () => void;
  onTabChange: (tab: TraceSpanView | "data") => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-2"
        role="tablist"
      >
        {(["trajectory", "tree", "timeline", "graph", "data"] as const).map((tab) => (
          <button
            className={cn(
              "h-8 shrink-0 rounded-md px-3 text-base font-medium capitalize text-muted-foreground",
              props.activeTab === tab && "bg-muted text-foreground",
            )}
            key={tab}
            role="tab"
            aria-selected={props.activeTab === tab}
            type="button"
            onClick={() => props.onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.activeTab === "data" ? (
          <SpanInspectorState
            error={props.selectedSpanError}
            loading={props.selectedSpanLoading ?? false}
            selectedSpanId={props.selectedSpanId}
            span={props.selectedSpan}
            onRetry={() => props.onRetrySelectedSpan?.()}
          />
        ) : (
          <TraceNavigator
            collapsed={props.collapsed}
            detail={props.detail}
            forest={props.forest}
            hideModeSwitch
            projectId={props.projectId}
            search={props.search}
            selectedSpanId={props.selectedSpanId}
            view={props.activeTab}
            onCollapsedChange={props.onCollapsedChange}
            onSearchChange={props.onSearchChange}
            onSelectSpan={props.onSelectSpan}
            onViewChange={() => undefined}
          />
        )}
      </div>
    </div>
  );
}
