import type { JsonValue } from "@lens/contracts";
import { Input } from "@lens/ui/components/input";
import { cn } from "@lens/ui/lib/utils";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
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
      <LargePayloadBlock json={serialized} title={props.title} />
    ) : mode === "raw" ? (
      <RawJsonBlock title={props.title} value={props.value} />
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
      <details className="group grid min-w-0 gap-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <CaretRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
          <h3 className="text-sm font-semibold">{props.title}</h3>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {tooLarge ? "Large payload" : `${flattenStructuredEntries(props.value).length} fields`}
          </span>
        </summary>
        <div className="grid gap-3 pl-5">
          <PayloadModeSwitch options={options} value={mode} onChange={setPreferredMode} />
          {content}
        </div>
      </details>
    );
  }

  return (
    <section className="grid min-w-0 gap-3">
      <header className="flex min-w-0 items-center gap-3">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <div className="ml-auto">
          <PayloadModeSwitch options={options} value={mode} onChange={setPreferredMode} />
        </div>
      </header>
      {content}
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
      className="flex h-7 shrink-0 items-center rounded-md border p-0.5"
      aria-label="Field view"
    >
      {props.options.map((option) => (
        <button
          aria-pressed={props.value === option.id}
          className={cn(
            "h-5 rounded px-2 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
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
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-5">
        {props.messages.map((message) => (
          <article
            className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-3"
            key={message.key}
          >
            <div className="pt-0.5">
              <RoleBadge role={message.role} />
            </div>
            <div className="grid min-w-0 gap-3">
              {message.content ? (
                <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">
                  {message.content}
                </p>
              ) : message.toolCalls.length === 0 ? (
                <span className="text-sm italic text-muted-foreground">No text content</span>
              ) : null}
              {message.toolCalls.map((tool) => (
                <ToolDisclosure key={tool.key} tool={tool} label="Tool call" />
              ))}
            </div>
          </article>
        ))}
      </div>
      {props.tools.length > 0 ? (
        <section>
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Available tools · {props.tools.length}
          </p>
          <div className="grid gap-2">
            {props.tools.map((tool) => (
              <ToolDisclosure key={tool.key} tool={tool} label="Definition" />
            ))}
          </div>
        </section>
      ) : null}
      {props.additional !== undefined ? (
        <details className="group/additional">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <CaretRight className="size-3 transition-transform group-open/additional:rotate-90" />
            Additional fields
          </summary>
          <div className="mt-3 border-l pl-4">
            <StructuredPayload value={props.additional} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ToolDisclosure(props: { tool: SpanPayloadTool; label: string }) {
  return (
    <details className="border-l-2 border-primary/40 pl-3">
      <summary className="cursor-pointer list-none py-1 text-xs [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {props.label}
        </span>{" "}
        <span className="font-semibold">{props.tool.name}</span>
        {props.tool.description ? (
          <span className="ml-2 text-muted-foreground">{props.tool.description}</span>
        ) : null}
      </summary>
      <div className="py-2">
        <StructuredPayload value={props.tool.value} />
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
    <div className="grid gap-2">
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
          <dl className="grid gap-1">
            {visible.map((entry) => (
              <div
                className="grid min-w-0 grid-cols-[minmax(8rem,0.42fr)_minmax(0,1fr)] gap-4 py-2 text-xs"
                key={entry.path}
              >
                <dt className="break-all font-mono text-muted-foreground" title={entry.path}>
                  {entry.path || entry.label}
                </dt>
                <dd className="m-0 whitespace-pre-wrap break-words font-mono">
                  {compactPayloadValue(entry.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No matching fields</p>
        )}
      </div>
    </div>
  );
}

function StructuredPayload({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <PrimitiveValue value={value} />;
    return (
      <div className="grid gap-1">
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
    if (entries.length === 0) return <PrimitiveValue value={value} />;
    return (
      <div className="grid gap-1">
        {entries.map(([key, item]) => (
          <StructuredRow key={key} label={key} value={item} depth={0} />
        ))}
      </div>
    );
  }
  return <PrimitiveValue value={value} />;
}

function StructuredRow(props: { label: string; value: unknown; depth: number }) {
  const nested = Array.isArray(props.value) || isRecord(props.value);
  if (!nested) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(7rem,0.34fr)_minmax(0,1fr)] gap-4 py-2 text-xs">
        <span className="break-all font-mono text-muted-foreground">{props.label}</span>
        <PrimitiveValue value={props.value} />
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
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-xs [&::-webkit-details-marker]:hidden">
        <CaretRight className="size-3 text-muted-foreground transition-transform group-open/row:rotate-90" />
        <span>{props.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {Array.isArray(props.value) ? `${entries.length} items` : `${entries.length} fields`}
        </span>
      </summary>
      <div className="ml-1.5 mt-2 grid gap-1 border-l pl-4">
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
          <PrimitiveValue value={props.value} />
        )}
      </div>
    </details>
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  return (
    <span
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words font-mono text-xs",
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
    <div className="border-y border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      No data captured
    </div>
  );
}

function structuredValueKey(value: unknown, index: number): string {
  return `${index}:${rawTraceJson(value).slice(0, 80)}`;
}
