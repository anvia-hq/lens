import type { SessionTurnPayload } from "@lens/contracts";
import { cn } from "@lens/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { extractSessionMessageText } from "../utils/session";
export function ConversationMessage(props: {
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
