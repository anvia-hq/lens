import type { SessionTurnPayload } from "@lens/contracts";
import { ArrowSquareOut as ExternalLink } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
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
    <section className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2">
      <span className="row-span-2 grid size-7 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">
        {props.icon}
      </span>
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
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
        <p className="m-0 min-w-0 whitespace-pre-wrap break-words text-sm leading-6">
          {extractSessionMessageText(props.payload.value, props.tone)}
        </p>
      ) : (
        <p className="m-0 text-sm italic text-muted-foreground">{props.empty}</p>
      )}
    </section>
  );
}
