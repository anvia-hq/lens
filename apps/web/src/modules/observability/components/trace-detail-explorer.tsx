import type { TraceDetail } from "@lens/contracts";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { useIsMobile } from "@lens/ui/hooks/use-mobile";
import { useMemo, useState } from "react";
import type { TracePayloadView, TraceSpanView } from "../types";
import {
  buildSpanForest,
  DETAIL_PANEL_ID,
  NAVIGATION_PANEL_ID,
  readStoredLayout,
  resolveSelectedSpan,
  storedPayloadView,
  TRACE_LAYOUT_STORAGE_KEY,
  TRACE_PAYLOAD_STORAGE_KEY,
} from "../utils/trace-detail";
import { EmptyInspector } from "./empty-inspector";
import { MobileTraceLayout } from "./mobile-trace-layout";
import { SpanInspector } from "./span-inspector";
import { TraceHeader } from "./trace-header";
import { TraceNavigator } from "./trace-navigator";

export function TraceDetailExplorer(props: {
  detail: TraceDetail;
  projectId: string;
  selectedSpanId?: string;
  view: TraceSpanView;
  onSelectSpan: (spanId: string) => void;
  onViewChange: (view: TraceSpanView) => void;
}) {
  const isMobile = useIsMobile();
  const forest = useMemo(() => buildSpanForest(props.detail.spans), [props.detail.spans]);
  const selected = resolveSelectedSpan(props.detail.spans, props.selectedSpanId);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<"tree" | "timeline" | "data">(() =>
    props.selectedSpanId ? "data" : props.view,
  );
  const [payloadView, setPayloadView] = useState<TracePayloadView>(() => storedPayloadView());
  const layout = useMemo(readStoredLayout, []);

  const selectSpan = (spanId: string) => {
    props.onSelectSpan(spanId);
    if (isMobile) setMobileTab("data");
  };
  const changePayloadView = (view: TracePayloadView) => {
    setPayloadView(view);
    try {
      window.localStorage.setItem(TRACE_PAYLOAD_STORAGE_KEY, view);
    } catch {
      // Local storage may be disabled; the in-memory preference still works.
    }
  };

  return (
    <main className="flex h-[calc(100svh-3.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden">
      <TraceHeader detail={props.detail} projectId={props.projectId} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isMobile ? (
          <MobileTraceLayout
            activeTab={mobileTab}
            collapsed={collapsed}
            detail={props.detail}
            forest={forest}
            payloadView={payloadView}
            search={search}
            selected={selected}
            selectedSpanId={selected?.spanId}
            onCollapsedChange={setCollapsed}
            onPayloadViewChange={changePayloadView}
            onSearchChange={setSearch}
            onSelectSpan={selectSpan}
            onTabChange={(tab) => {
              setMobileTab(tab);
              if (tab !== "data") props.onViewChange(tab);
            }}
          />
        ) : (
          <ResizablePanelGroup
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
            <ResizablePanel id={NAVIGATION_PANEL_ID} defaultSize="36" minSize={280} maxSize="55">
              <TraceNavigator
                collapsed={collapsed}
                detail={props.detail}
                forest={forest}
                search={search}
                selectedSpanId={selected?.spanId}
                view={props.view}
                onCollapsedChange={setCollapsed}
                onSearchChange={setSearch}
                onSelectSpan={selectSpan}
                onViewChange={props.onViewChange}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id={DETAIL_PANEL_ID} defaultSize="64" minSize={420}>
              {selected === undefined ? (
                <EmptyInspector />
              ) : (
                <SpanInspector
                  payloadView={payloadView}
                  span={selected}
                  onPayloadViewChange={changePayloadView}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </main>
  );
}
