import type { JsonValue, SessionDetail, SessionTurnPayload } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { buttonVariants } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Clock3,
  Coins,
  ExternalLink,
  MessageCircle,
  MessagesSquare,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

export function SessionConversation(props: { detail: SessionDetail; projectId: string }) {
  const summary = props.detail.summary;
  return (
    <main className="grid h-[calc(100svh-3.5rem)] min-h-0 w-full flex-1 overflow-auto bg-muted/10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
      <section className="min-w-0 lg:overflow-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-8">
          <div>
            <h2 className="text-sm font-semibold">Conversation</h2>
            <p className="text-xs text-muted-foreground">
              {formatNumber(props.detail.turns.length)}{" "}
              {props.detail.turns.length === 1 ? "turn" : "turns"}
            </p>
          </div>
          <Badge variant="outline">{formatNumber(summary.traceCount)} traces</Badge>
        </header>
        <div className="mx-auto grid w-full max-w-5xl content-start">
          {props.detail.turns.length === 0 ? (
            <div className="grid min-h-80 place-items-center p-8 text-center">
              <div className="grid max-w-sm gap-2">
                <MessageCircle className="mx-auto size-8 text-muted-foreground" />
                <span className="text-sm font-medium">No conversation payloads captured</span>
                <span className="text-xs text-muted-foreground">
                  This session has traces, but none contain input or output data.
                </span>
              </div>
            </div>
          ) : (
            props.detail.turns.map((turn, index) => (
              <article
                className="grid gap-5 border-b bg-background px-4 py-6 md:px-8"
                key={turn.trace.traceId}
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Turn {index + 1}
                      </span>
                      <Badge variant={turn.trace.status === "error" ? "destructive" : "outline"}>
                        {turn.trace.status === "ok" ? "Success" : turn.trace.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{turn.trace.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatTimestamp(turn.trace.startedAt)} · {shortId(turn.trace.traceId)}
                    </p>
                  </div>
                  <Link
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    to="/$projectId/traces/$traceId"
                    params={{ projectId: props.projectId, traceId: turn.trace.traceId }}
                  >
                    Open trace <ExternalLink />
                  </Link>
                </div>
                <div className="grid gap-4">
                  <ConversationMessage
                    label="User"
                    icon={<User />}
                    payload={turn.prompt}
                    empty="No user prompt captured"
                    tone="user"
                    projectId={props.projectId}
                    traceId={turn.trace.traceId}
                  />
                  <ConversationMessage
                    label="Assistant"
                    icon={<Bot />}
                    payload={turn.response}
                    empty="No final response captured"
                    tone="assistant"
                    projectId={props.projectId}
                    traceId={turn.trace.traceId}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <MetricPill
                    icon={<Clock3 />}
                    label="Duration"
                    value={formatDuration(turn.trace.durationMs)}
                  />
                  <MetricPill
                    icon={<Activity />}
                    label="Spans"
                    value={formatNumber(turn.trace.spanCount)}
                  />
                  <MetricPill
                    icon={<Coins />}
                    label="Cost"
                    value={formatCost(turn.trace.totalCost)}
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      <SessionMetadata detail={props.detail} />
    </main>
  );
}

function SessionMetadata({ detail }: { detail: SessionDetail }) {
  const summary = detail.summary;
  return (
    <aside className="min-w-0 border-t bg-background lg:overflow-auto lg:border-t-0 lg:border-l">
      <div className="grid gap-6 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-600 text-white">
            <MessagesSquare className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Session details</p>
            <h1 className="break-all font-mono text-sm font-semibold tracking-tight">
              {summary.sessionId}
            </h1>
          </div>
        </div>

        <MetadataSection title="Overview">
          <MetadataRow label="Status">
            <Badge variant={summary.status === "error" ? "destructive" : "secondary"}>
              {summary.status === "error" ? `${summary.errorCount} errors` : "Success"}
            </Badge>
          </MetadataRow>
          <MetadataRow label="User">
            <span className="break-all font-mono">{summary.userId ?? "—"}</span>
          </MetadataRow>
          <MetadataRow label="Started">{formatTimestamp(summary.startedAt)}</MetadataRow>
          <MetadataRow label="Ended">{formatTimestamp(summary.endedAt)}</MetadataRow>
          <MetadataRow label="Last seen">{formatTimestamp(summary.lastSeenAt)}</MetadataRow>
          <MetadataRow label="Duration">{formatDuration(summary.durationMs)}</MetadataRow>
        </MetadataSection>

        <MetadataSection title="Usage">
          <MetadataRow label="Traces">{formatNumber(summary.traceCount)}</MetadataRow>
          <MetadataRow label="Spans">{formatNumber(summary.spanCount)}</MetadataRow>
          <MetadataRow label="Input tokens">{formatNumber(summary.inputTokens)}</MetadataRow>
          <MetadataRow label="Output tokens">{formatNumber(summary.outputTokens)}</MetadataRow>
          <MetadataRow label="Total tokens">{formatNumber(summary.totalTokens)}</MetadataRow>
          <MetadataRow label="Input cost">{formatCost(summary.inputCost)}</MetadataRow>
          <MetadataRow label="Output cost">{formatCost(summary.outputCost)}</MetadataRow>
          <MetadataRow label="Total cost">{formatCost(summary.totalCost)}</MetadataRow>
        </MetadataSection>

        <MetadataValues label="Models" values={summary.models} />
        <MetadataValues label="Services" values={summary.services} />
        <MetadataValues label="Environments" values={summary.environments} />
        <MetadataValues label="Tags" values={summary.tags} />
      </div>
    </aside>
  );
}

function MetadataSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="grid gap-2.5 text-xs">{children}</dl>
    </section>
  );
}

function MetadataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function MetadataValues({ label, values }: { label: string; values: string[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <Badge className="max-w-full truncate" key={value} title={value} variant="outline">
              {value}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </section>
  );
}

function ConversationMessage(props: {
  label: string;
  icon: ReactNode;
  payload: SessionTurnPayload | null;
  empty: string;
  tone: "user" | "assistant";
  projectId: string;
  traceId: string;
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-2 rounded-xl border px-4 py-3",
        props.tone === "user"
          ? "ml-auto w-[min(90%,48rem)] bg-muted/40"
          : "mr-auto w-full bg-background",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-foreground text-background [&_svg]:size-3">
          {props.icon}
        </span>
        <span>{props.label}</span>
        {props.payload ? (
          <Link
            className="ml-auto flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            to="/$projectId/traces/$traceId"
            params={{ projectId: props.projectId, traceId: props.traceId }}
            search={{ span: props.payload.spanId }}
            title={`Open ${props.payload.spanName}`}
          >
            <span className="max-w-48 truncate">{props.payload.spanName}</span>
            <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>
      {props.payload ? (
        <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">
          {extractSessionMessageText(props.payload.value, props.tone)}
        </p>
      ) : (
        <p className="m-0 text-sm italic text-muted-foreground">{props.empty}</p>
      )}
    </section>
  );
}

export function extractSessionMessageText(
  value: JsonValue,
  direction: "user" | "assistant",
): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "";
  if (Array.isArray(value)) {
    const matching = [...value]
      .reverse()
      .find(
        (item) =>
          isRecord(item) && typeof item.role === "string" && item.role.toLowerCase() === direction,
      );
    return extractSessionMessageText(matching ?? value.at(-1) ?? null, direction);
  }

  const role = typeof value.role === "string" ? value.role.toLowerCase() : undefined;
  if (role === direction && value.content !== undefined) {
    return extractSessionMessageText(value.content, direction);
  }
  const preferredKeys =
    direction === "user"
      ? ["prompt", "question", "input", "messages", "history", "chatHistory"]
      : ["choice", "response", "output", "result", "message", "content", "text"];
  for (const key of preferredKeys) {
    const nested = value[key];
    if (nested !== undefined && nested !== null) {
      const text = extractSessionMessageText(nested, direction);
      if (text.length > 0) return text;
    }
  }
  for (const key of ["content", "text", "message", "value"] as const) {
    const nested = value[key];
    if (nested !== undefined && nested !== null) {
      const text = extractSessionMessageText(nested, direction);
      if (text.length > 0) return text;
    }
  }
  return JSON.stringify(value, null, 2);
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function MetricPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground [&_svg]:size-3.5">{props.icon}</span>
      <span className="text-muted-foreground">{props.label}</span>
      <span className="font-mono font-medium">{props.value}</span>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: value > 99_999 ? "compact" : "standard" }).format(
    value,
  );
}

function formatDuration(value: number): string {
  if (value < 1) return `${Math.round(value * 1_000)}µs`;
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(2)}s`;
}

function formatCost(value: number | null): string {
  if (value === null) return "—";
  if (value > 0 && value < 0.0001) return "<$0.0001";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
