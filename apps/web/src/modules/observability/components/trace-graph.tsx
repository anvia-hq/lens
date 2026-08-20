import type { TraceSpanSummary } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import {
  ArrowsOutSimple as FitView,
  FlowArrow,
  WarningCircle,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut,
} from "@phosphor-icons/react";
import { type Selection, select } from "d3-selection";
import { zoom as createZoom, type ZoomBehavior, type ZoomTransform, zoomIdentity } from "d3-zoom";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { spanDurationMs } from "../utils/trace-detail";
import { traceGraphNodeMatches } from "../utils/trace-graph";
import {
  requestTraceGraphLayout,
  TraceGraphLayoutCancelledError,
  type TraceGraphWorkerResult,
} from "../utils/trace-graph-layout-client";
import { TraceGraphNode } from "./trace-graph-node";

type Viewport = { x: number; y: number; k: number };

const FIT_PADDING = 24;
const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
const MAX_FIT_SCALE = 1.2;
const ZOOM_STEP = 1.4;

export default function TraceGraph(props: {
  spans: TraceSpanSummary[];
  search: string;
  selectedSpanId?: string;
  onSelectSpan: (spanId: string) => void;
}) {
  const [layoutAttempt, setLayoutAttempt] = useState(0);
  const graphShapeKey = useMemo(
    () =>
      props.spans
        .map((span) => `${span.spanId}:${span.parentSpanId ?? ""}:${span.observationKind}`)
        .join("|"),
    [props.spans],
  );
  const graphRequestRef = useRef({ shapeKey: graphShapeKey, spans: props.spans });
  if (graphRequestRef.current.shapeKey !== graphShapeKey) {
    graphRequestRef.current = { shapeKey: graphShapeKey, spans: props.spans };
  }
  const [layoutState, setLayoutState] = useState<{
    attempt: number;
    shapeKey: string;
    result: TraceGraphWorkerResult;
  }>();
  const [layoutError, setLayoutError] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fitted, setFitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Selection<HTMLDivElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const programmaticRef = useRef(false);
  const userOverrideRef = useRef(false);
  const fittedRef = useRef(false);
  const current =
    layoutState?.shapeKey === graphShapeKey && layoutState.attempt === layoutAttempt
      ? layoutState.result
      : undefined;
  const graph = useMemo(() => {
    if (!current?.graph) return undefined;
    const spans = new Map(props.spans.map((span) => [span.spanId, span]));
    return {
      ...current.graph,
      nodes: current.graph.nodes.map((node) => {
        if (!node.spanId) return node;
        const span = spans.get(node.spanId);
        return span
          ? {
              ...node,
              label: span.name,
              status: span.status,
              durationMs: spanDurationMs(span),
              totalTokens: span.totalTokens,
              totalCost: span.totalCost,
              serviceName: span.serviceName,
              model: span.model,
            }
          : node;
      }),
    };
  }, [current?.graph, props.spans]);
  const layout = current?.layout;

  useEffect(() => {
    const controller = new AbortController();
    setLayoutError(false);
    setFitted(false);
    fittedRef.current = false;
    userOverrideRef.current = false;
    void requestTraceGraphLayout(graphRequestRef.current.spans, controller.signal).then(
      (result) => setLayoutState({ attempt: layoutAttempt, shapeKey: graphShapeKey, result }),
      (error: unknown) => {
        if (error instanceof TraceGraphLayoutCancelledError) return;
        setLayoutError(true);
      },
    );
    return () => controller.abort();
  }, [graphShapeKey, layoutAttempt]);

  const writeTransform = useCallback((transform: Viewport) => {
    const world = worldRef.current;
    if (!world) return;
    world.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`;
    world.style.setProperty("--trace-graph-stroke-scale", String(Math.max(1, 1 / transform.k)));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const selection = select<HTMLDivElement, unknown>(container);
    const behavior = createZoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      .filter((event) => {
        if (event.type === "wheel") return true;
        return !(event.target instanceof Element && event.target.closest("[data-graph-node]"));
      })
      .on("zoom", (event: { transform: ZoomTransform }) => {
        if (!programmaticRef.current) userOverrideRef.current = true;
        writeTransform(event.transform);
        if (!fittedRef.current) {
          fittedRef.current = true;
          setFitted(true);
        }
      });
    selection.call(behavior).on("dblclick.zoom", null);
    selectionRef.current = selection;
    zoomRef.current = behavior;
    return () => {
      selection.on(".zoom", null);
      selectionRef.current = null;
      zoomRef.current = null;
    };
  }, [writeTransform]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      setSize({ width: bounds.width, height: bounds.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const applyViewport = useCallback(
    (viewport: Viewport) => {
      const selection = selectionRef.current;
      const behavior = zoomRef.current;
      if (!selection || !behavior) {
        writeTransform(viewport);
        fittedRef.current = true;
        setFitted(true);
        return;
      }
      programmaticRef.current = true;
      selection.call(
        behavior.transform,
        zoomIdentity.translate(viewport.x, viewport.y).scale(viewport.k),
      );
      programmaticRef.current = false;
    },
    [writeTransform],
  );

  const fitGraph = useCallback(() => {
    if (!layout || size.width <= 0 || size.height <= 0) return;
    const availableWidth = Math.max(1, size.width - FIT_PADDING * 2);
    const availableHeight = Math.max(1, size.height - FIT_PADDING * 2);
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        MAX_FIT_SCALE,
        availableWidth / Math.max(1, layout.width),
        availableHeight / Math.max(1, layout.height),
      ),
    );
    applyViewport({
      x: (size.width - layout.width * scale) / 2,
      y: (size.height - layout.height * scale) / 2,
      k: scale,
    });
  }, [applyViewport, layout, size.height, size.width]);

  useEffect(() => {
    if (!layout || userOverrideRef.current) return;
    fitGraph();
  }, [fitGraph, layout]);

  const zoomBy = (factor: number) => {
    const selection = selectionRef.current;
    const behavior = zoomRef.current;
    if (!selection || !behavior) return;
    selection.call(behavior.scaleBy, factor);
  };
  const selectedNodeId = props.selectedSpanId
    ? graph?.spanToNodeId.get(props.selectedSpanId)
    : undefined;

  if (graph?.limitExceeded) {
    return (
      <GraphMessage
        icon={<WarningCircle />}
        title="Graph too complex"
        text={`This trace has ${graph.limitExceeded.nodeCount.toLocaleString()} graphable spans and ${graph.limitExceeded.edgeCount.toLocaleString()} inferred edges. Use Tree or Timeline to inspect it.`}
      />
    );
  }
  if (graph && graph.nodes.length === 0) {
    return (
      <GraphMessage
        icon={<FlowArrow />}
        title="No graphable spans"
        text="This trace only contains events. Use Tree or Timeline to inspect them."
      />
    );
  }
  if (layoutError) {
    return (
      <GraphMessage
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLayoutAttempt((value) => value + 1)}
          >
            Retry
          </Button>
        }
        icon={<WarningCircle />}
        title="Unable to lay out graph"
        text="The trace data is still available in Tree and Timeline."
      />
    );
  }

  const nodeById = new Map(graph?.nodes.map((node) => [node.id, node]) ?? []);
  const strokeStyle = {
    strokeWidth: "calc(1.25px * var(--trace-graph-stroke-scale, 1))",
  } as CSSProperties;

  return (
    <section className="relative h-full overflow-hidden bg-muted/15" aria-label="Span graph">
      <div
        className="absolute inset-0 touch-none cursor-grab overflow-hidden active:cursor-grabbing"
        ref={containerRef}
      >
        <div
          className={cn(
            "absolute left-0 top-0 origin-top-left transition-opacity duration-150",
            fitted ? "opacity-100" : "opacity-0",
          )}
          ref={worldRef}
          style={{ width: layout?.width ?? 0, height: layout?.height ?? 0 }}
        >
          {layout ? (
            <svg
              aria-hidden="true"
              className="absolute inset-0 overflow-visible"
              height={layout.height}
              width={layout.width}
            >
              <defs>
                <marker
                  id="trace-graph-arrow"
                  markerHeight="7"
                  markerWidth="7"
                  orient="auto-start-reverse"
                  refX="6"
                  refY="3.5"
                  viewBox="0 0 7 7"
                >
                  <path className="fill-muted-foreground" d="M 0 0 L 7 3.5 L 0 7 z" />
                </marker>
              </defs>
              {layout.edges.flatMap((edge) =>
                edge.paths.map((points) => (
                  <path
                    className="fill-none stroke-muted-foreground/55"
                    d={pathData(points)}
                    key={`${edge.id}:${pathData(points)}`}
                    markerEnd="url(#trace-graph-arrow)"
                    style={strokeStyle}
                  />
                )),
              )}
            </svg>
          ) : null}
          {layout?.nodes.map((position) => {
            const node = nodeById.get(position.id);
            if (!node) return null;
            return (
              <TraceGraphNode
                dimmed={!traceGraphNodeMatches(node, props.search)}
                height={position.height}
                key={node.id}
                node={node}
                selected={selectedNodeId === node.id}
                width={position.width}
                x={position.x}
                y={position.y}
                onSelect={() => {
                  if (node.spanId) props.onSelectSpan(node.spanId);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button
          aria-label="Zoom graph out"
          disabled={!layout}
          size="icon-sm"
          title="Zoom out"
          variant="ghost"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <ZoomOut />
        </Button>
        <Button
          aria-label="Zoom graph in"
          disabled={!layout}
          size="icon-sm"
          title="Zoom in"
          variant="ghost"
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <ZoomIn />
        </Button>
        <Button
          aria-label="Fit graph to view"
          disabled={!layout}
          size="icon-sm"
          title="Fit view"
          variant="ghost"
          onClick={() => {
            userOverrideRef.current = false;
            fitGraph();
          }}
        >
          <FitView />
        </Button>
      </div>
      {!layout ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          Laying out graph…
        </div>
      ) : null}
    </section>
  );
}

function pathData(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function GraphMessage(props: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="grid max-w-sm justify-items-center gap-2 text-muted-foreground">
        <span className="[&_svg]:size-6">{props.icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
        <p className="text-xs leading-relaxed">{props.text}</p>
        {props.action ? <div className="mt-1">{props.action}</div> : null}
      </div>
    </div>
  );
}
