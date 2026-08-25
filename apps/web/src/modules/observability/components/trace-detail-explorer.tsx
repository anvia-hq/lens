import type { SpanDetail, TraceDetail } from "@lens/contracts";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { useMemo, useState } from "react";
import type { TraceSpanView } from "../types";
import {
  buildTraceSpanForest,
  DETAIL_PANEL_ID,
  NAVIGATION_PANEL_ID,
  readStoredLayout,
  TRACE_LAYOUT_STORAGE_KEY,
} from "../utils/trace-detail";
import { DataDeletionDialog } from "./data-deletion-dialog";
import { MobileTraceLayout } from "./mobile-trace-layout";
import { SpanInspectorState } from "./span-inspector-state";
import { TraceHeader } from "./trace-header";
import { TraceNavigator } from "./trace-navigator";
import { TraceReviewPanel } from "./trace-review-panel";

export function TraceDetailExplorer(props: {
  canManage?: boolean;
  detail: TraceDetail;
  projectId: string;
  selectedSpanId?: string;
  selectedSpan?: SpanDetail;
  selectedSpanError?: Error | null;
  selectedSpanLoading?: boolean;
  view: TraceSpanView;
  onSelectSpan: (spanId: string) => void;
  onRetrySelectedSpan?: () => void;
  onViewChange: (view: TraceSpanView) => void;
  onDelete?: () => void;
  deletionPending?: boolean;
}) {
  const isMobile = useIsMobile();
  const forest = useMemo(() => buildTraceSpanForest(props.detail), [props.detail]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<TraceSpanView | "data">(() =>
    props.selectedSpanId ? "data" : props.view,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const layout = useMemo(readStoredLayout, []);

  const selectSpan = (spanId: string) => {
    props.onSelectSpan(spanId);
    if (isMobile) setMobileTab("data");
  };
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <TraceHeader
        detail={props.detail}
        projectId={props.projectId}
        canDelete={props.onDelete !== undefined}
        onDelete={() => setDeleteOpen(true)}
      />
      <TraceReviewPanel
        canManage={props.canManage ?? false}
        detail={props.detail}
        projectId={props.projectId}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          <MobileTraceLayout
            activeTab={mobileTab}
            collapsed={collapsed}
            detail={props.detail}
            forest={forest}
            search={search}
            selectedSpan={props.selectedSpan}
            selectedSpanError={props.selectedSpanError}
            selectedSpanLoading={props.selectedSpanLoading ?? false}
            selectedSpanId={props.selectedSpanId}
            onCollapsedChange={setCollapsed}
            onSearchChange={setSearch}
            onSelectSpan={selectSpan}
            onRetrySelectedSpan={() => props.onRetrySelectedSpan?.()}
            onTabChange={(tab) => {
              setMobileTab(tab);
              if (tab !== "data") props.onViewChange(tab);
            }}
          />
        ) : (
          <ResizablePanelGroup
            className="min-h-0 overflow-hidden"
            id="trace-detail-layout"
            orientation="horizontal"
            defaultLayout={layout}
            onLayoutChanged={(next, meta) => {
              if (!meta.isUserInteraction) return;
              try {
                window.localStorage.setItem(TRACE_LAYOUT_STORAGE_KEY, JSON.stringify(next));
              } catch {
                // Ignore unavailable storage.
              }
            }}
          >
            <ResizablePanel
              className="min-h-0 min-w-0 overflow-hidden"
              id={NAVIGATION_PANEL_ID}
              defaultSize="36"
              minSize={280}
              maxSize={props.view === "graph" ? "70" : "55"}
            >
              <TraceNavigator
                collapsed={collapsed}
                detail={props.detail}
                forest={forest}
                search={search}
                selectedSpanId={props.selectedSpanId}
                view={props.view}
                onCollapsedChange={setCollapsed}
                onSearchChange={setSearch}
                onSelectSpan={selectSpan}
                onViewChange={props.onViewChange}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              className="min-h-0 min-w-0 overflow-hidden"
              id={DETAIL_PANEL_ID}
              defaultSize="64"
              minSize={420}
            >
              <SpanInspectorState
                error={props.selectedSpanError}
                loading={props.selectedSpanLoading ?? false}
                selectedSpanId={props.selectedSpanId}
                span={props.selectedSpan}
                onRetry={() => props.onRetrySelectedSpan?.()}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      <DataDeletionDialog
        entityType="trace"
        ids={deleteOpen ? [props.detail.summary.traceId] : []}
        pending={props.deletionPending ?? false}
        onOpenChange={setDeleteOpen}
        onConfirm={() => props.onDelete?.()}
      />
    </main>
  );
}
