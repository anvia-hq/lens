import type { JsonValue } from "@lens/contracts";
import { Input } from "@lens/ui/components/input";
import { cn } from "@lens/ui/lib/utils";
import { ChevronRight as CaretRight, Search as MagnifyingGlass } from "@mynaui/icons-react";
import { useId, useMemo, useState } from "react";
import {
  analyzeSpanPayload,
  compactPayloadValue,
  flattenStructuredEntries,
  type SpanPayloadMessage,
  type SpanPayloadTool,
} from "../utils/span-payload";
import { isRecord, rawTraceJson } from "../utils/trace-detail";
import { LARGE_PAYLOAD_PREVIEW_CHARACTERS, LargePayloadBlock } from "./large-payload-block";
import { looksLikeJsonPreview, MarkdownContent } from "./markdown-content";
import { RawJsonBlock } from "./raw-json-block";
import { RoleBadge } from "./role-badge";

type SpanPayloadField = "input" | "output" | "metadata";
type SpanPayloadMode = "readable" | "structured" | "table" | "raw";

type ViewOption = { id: SpanPayloadMode; label: string };

export function SpanPayloadSection(props: {
  field: SpanPayloadField;
  title: string;
  value: JsonValue | Record<string, unknown> | null;
}) {
  const serialized = useMemo(
    () =>
      props.value === null || props.value === undefined ? undefined : rawTraceJson(props.value),
    [props.value],
  );
  const tooLarge = serialized !== undefined && serialized.length > LARGE_PAYLOAD_PREVIEW_CHARACTERS;
  const analysis = useMemo(
    () => (tooLarge ? undefined : analyzeSpanPayload(props.value)),
    [props.value, tooLarge],
  );
  const options = useMemo<ViewOption[]>(() => {
    if (tooLarge) return [{ id: "raw", label: "Raw" }];
    if (props.field === "metadata") {
      return [
        { id: "table", label: "Table" },
        { id: "raw", label: "JSON" },
      ];
    }
    if (analysis?.hasMessages) {
      return [
        {
          id: "readable",
          label: props.field === "output" ? "Response" : "Messages",
        },
        { id: "structured", label: "Structure" },
        { id: "raw", label: "Raw" },
      ];
    }
    return [
      { id: "structured", label: "Structure" },
      { id: "raw", label: "Raw" },
    ];
  }, [analysis?.hasMessages, props.field, tooLarge]);
  const [preferredMode, setPreferredMode] = useState<SpanPayloadMode>(
    () => options[0]?.id ?? "raw",
  );
  const mode = options.some((option) => option.id === preferredMode)
    ? preferredMode
    : (options[0]?.id ?? "raw");

  const content =
    props.value === null || props.value === undefined ? (
      <EmptyPayload />
    ) : tooLarge && serialized !== undefined ? (
      <div className="p-3.5">
        <LargePayloadBlock json={serialized} title={props.title} />
      </div>
    ) : mode === "raw" ? (
      <RawJsonBlock embedded title={props.title} value={props.value} />
    ) : mode === "table" ? (
      <MetadataTable value={props.value} />
    ) : mode === "readable" && analysis?.hasMessages ? (
      <ReadableMessages
        additional={analysis.additional}
        messages={analysis.messages}
        tools={analysis.tools}
      />
    ) : (
      <StructuredPayload value={props.value} />
    );

  if (props.field === "metadata") {
    return (
      <details className="group min-w-0 overflow-hidden rounded-lg border bg-card/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/30 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-open:border-b [&::-webkit-details-marker]:hidden">
          <CaretRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {props.title}
          </h3>
          <span className="ml-auto font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {tooLarge ? "Large payload" : `${flattenStructuredEntries(props.value).length} fields`}
          </span>
        </summary>
        <div className="grid min-w-0">
          {options.length >= 2 ? (
            <div className="flex items-center justify-end border-b px-3 py-1.5">
              <PayloadModeSwitch options={options} value={mode} onChange={setPreferredMode} />
            </div>
          ) : null}
          {content}
        </div>
      </details>
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card/40">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b bg-muted/30 px-3 py-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {props.title}
        </h3>
        <PayloadModeSwitch options={options} value={mode} onChange={setPreferredMode} />
      </header>
      <div className="min-w-0">{content}</div>
    </section>
  );
}

function PayloadModeSwitch(props: {
  options: ViewOption[];
  value: SpanPayloadMode;
  onChange: (mode: SpanPayloadMode) => void;
}) {
  if (props.options.length < 2) return null;
  return (
    <fieldset
      className="flex h-6 shrink-0 items-center rounded-md border bg-background p-0.5"
      aria-label="Field view"
    >
      {props.options.map((option) => (
        <button
          aria-pressed={props.value === option.id}
          className={cn(
            "h-5 rounded px-2 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors",
            props.value === option.id && "bg-muted text-foreground",
          )}
          key={option.id}
          type="button"
          onClick={() => props.onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function ReadableMessages(props: {
  messages: SpanPayloadMessage[];
  tools: SpanPayloadTool[];
  additional: unknown;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 divide-y divide-border/50 px-3.5 py-1">
      {props.messages.map((message) => (
        <article
          className="grid min-w-0 grid-cols-[minmax(5.5rem,0.18fr)_minmax(0,1fr)] gap-3 py-2.5"
          key={message.key}
        >
          <div className="pt-0.5">
            <RoleBadge role={message.role} />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2.5">
            {message.reasoning ? (
              <div className="grid min-w-0 grid-cols-1 gap-1 rounded-md border bg-muted/20 px-3 py-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reasoning
                </span>
                <MarkdownContent
                  compact
                  content={message.reasoning}
                  className="text-muted-foreground"
                />
              </div>
            ) : null}
            {message.content ? (
              looksLikeJsonPreview(message.content) ? (
                <p className="m-0 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5">
                  {message.content}
                </p>
              ) : (
                <MarkdownContent compact content={message.content} />
              )
            ) : !message.reasoning && message.toolCalls.length === 0 ? (
              <span className="text-xs italic text-muted-foreground">No text content</span>
            ) : null}
            {message.toolCalls.map((tool) => (
              <ToolDisclosure key={tool.key} tool={tool} label="Tool call" />
            ))}
          </div>
        </article>
      ))}
      {props.tools.length > 0 ? (
        <section className="min-w-0 py-2.5">
          <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Available tools · {props.tools.length}
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            {props.tools.map((tool) => (
              <ToolDisclosure key={tool.key} tool={tool} label="Definition" />
            ))}
          </div>
        </section>
      ) : null}
      {props.additional !== undefined ? (
        <details className="group/additional min-w-0 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <CaretRight className="size-3 transition-transform group-open/additional:rotate-90" />
            Additional fields
          </summary>
          <div className="mt-2 min-w-0 overflow-hidden rounded-md border bg-muted/20">
            <StructuredPayload value={props.additional} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ToolDisclosure(props: { tool: SpanPayloadTool; label: string }) {
  return (
    <details className="rounded-md border bg-muted/20 px-3 py-1.5">
      <summary className="cursor-pointer list-none py-0.5 text-xs [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
          {props.label}
        </span>{" "}
        <span className="font-semibold">{props.tool.name}</span>
        {props.tool.description ? (
          <span className="ml-2 text-muted-foreground">{props.tool.description}</span>
        ) : null}
      </summary>
      <div className="mt-1.5 border-t pt-1">
        <StructuredPayload compact value={props.tool.value} />
      </div>
    </details>
  );
}

function MetadataTable({ value }: { value: unknown }) {
  const searchId = useId();
  const entries = useMemo(() => flattenStructuredEntries(value), [value]);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? entries.filter(
        (entry) =>
          entry.path.toLowerCase().includes(normalized) ||
          compactPayloadValue(entry.value).toLowerCase().includes(normalized),
      )
    : entries;
  return (
    <div className="grid gap-2 p-3">
      <label className="relative block" htmlFor={searchId}>
        <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search metadata"
          className="h-8 pl-8 font-mono text-xs"
          id={searchId}
          placeholder="Search metadata"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="min-w-0 overflow-hidden">
        {visible.length > 0 ? (
          <dl className="grid divide-y divide-border/40">
            {visible.map((entry) => (
              <div
                className="grid min-w-0 grid-cols-[minmax(8rem,0.34fr)_minmax(0,1fr)] gap-3 py-2 text-xs leading-5"
                key={entry.path}
              >
                <dt className="break-all font-mono text-muted-foreground" title={entry.path}>
                  {entry.path || entry.label}
                </dt>
                <dd className="m-0 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono">
                  {compactPayloadValue(entry.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="py-5 text-center text-xs text-muted-foreground">No matching fields</p>
        )}
      </div>
    </div>
  );
}

function StructuredPayload({ compact, value }: { compact?: boolean; value: unknown }) {
  const containerClass = cn(
    "grid min-w-0 grid-cols-1 divide-y divide-border/40",
    !compact && "px-3.5 py-1",
  );
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className={cn(!compact && "px-3.5 py-2.5")}>
          <PrimitiveValue value={value} />
        </div>
      );
    }
    return (
      <div className={containerClass}>
        {value.map((item, index) => (
          <StructuredRow
            key={structuredValueKey(item, index)}
            label={String(index)}
            value={item}
            depth={0}
          />
        ))}
      </div>
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return (
        <div className={cn(!compact && "px-3.5 py-2.5")}>
          <PrimitiveValue value={value} />
        </div>
      );
    }
    return (
      <div className={containerClass}>
        {entries.map(([key, item]) => (
          <StructuredRow key={key} label={key} value={item} depth={0} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn(!compact && "px-3.5 py-2.5")}>
      <PrimitiveValue value={value} />
    </div>
  );
}

function StructuredRow(props: { label: string; value: unknown; depth: number }) {
  const nested = Array.isArray(props.value) || isRecord(props.value);
  if (!nested) {
    return (
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 py-2 text-xs leading-5">
        <span className="w-26 shrink-0 break-all font-mono text-muted-foreground">
          {props.label}
        </span>
        <div className="min-w-40 flex-1">
          <PrimitiveValue value={props.value} />
        </div>
      </div>
    );
  }
  const entries = Array.isArray(props.value)
    ? props.value.map((item, index) => [String(index), item] as const)
    : isRecord(props.value)
      ? Object.entries(props.value)
      : [];
  return (
    <details open={props.depth < 1} className="group/row py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-xs leading-5 [&::-webkit-details-marker]:hidden">
        <CaretRight className="size-3 text-muted-foreground transition-transform group-open/row:rotate-90" />
        <span>{props.label}</span>
        <span className="text-xs text-muted-foreground">
          {Array.isArray(props.value) ? `${entries.length} items` : `${entries.length} fields`}
        </span>
      </summary>
      <div className="ml-1.5 mt-1.5 grid divide-y divide-border/30 border-l pl-3.5">
        {entries.length > 0 ? (
          entries.map(([key, item]) => (
            <StructuredRow
              depth={props.depth + 1}
              key={`${props.label}:${key}`}
              label={key}
              value={item}
            />
          ))
        ) : (
          <div className="py-1">
            <PrimitiveValue value={props.value} />
          </div>
        )}
      </div>
    </details>
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  return (
    <span
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5",
        (value === null || value === undefined) && "text-syntax-comment",
        typeof value === "string" && "text-syntax-string",
        typeof value === "number" && "text-syntax-number",
        typeof value === "boolean" && "text-syntax-literal",
      )}
    >
      {compactPayloadValue(value)}
    </span>
  );
}

function EmptyPayload() {
  return (
    <div className="px-3.5 py-5 text-center text-xs text-muted-foreground">No data captured</div>
  );
}

function structuredValueKey(value: unknown, index: number): string {
  return `${index}:${rawTraceJson(value).slice(0, 80)}`;
}
