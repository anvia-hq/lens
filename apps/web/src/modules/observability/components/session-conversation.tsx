import type { SessionDetail } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { buttonVariants } from "@lens/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Activity, Bot, Clock3, Coins, ExternalLink, MessageCircle, User } from "lucide-react";
import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTimestamp,
  shortId,
} from "../utils/session";
import { ConversationMessage } from "./conversation-message";
import { MetricPill } from "./metric-pill";
import { SessionMetadata } from "./session-metadata";
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
