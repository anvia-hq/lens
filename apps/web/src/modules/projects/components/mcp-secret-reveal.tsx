import type { CreatedProjectMcpToken } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Check, Copy, Robot, X } from "@phosphor-icons/react";
import { useState } from "react";

export function McpSecretReveal(props: {
  credentials: CreatedProjectMcpToken;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const configuration = JSON.stringify(
    {
      mcpServers: {
        "anvia-lens": {
          type: "http",
          url: `${window.location.origin}/api/mcp`,
          headers: { Authorization: `Bearer ${props.credentials.token}` },
        },
      },
    },
    null,
    2,
  );
  return (
    <div className="overflow-hidden rounded-xl border border-status-warning/40 bg-status-warning/10">
      <div className="flex items-start gap-3 border-b border-status-warning/30 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-status-warning-fill text-status-warning-fill-foreground">
          <Robot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Your MCP token is ready</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Copy this remote MCP configuration now. The token cannot be shown again.
          </p>
        </div>
        <Button
          aria-label="Close MCP token details"
          size="icon-sm"
          variant="ghost"
          onClick={props.onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 p-4">
        <pre className="max-h-80 overflow-auto whitespace-pre rounded-lg border bg-background/80 p-3 font-mono text-xs leading-5">
          {configuration}
        </pre>
        <div>
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(configuration);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy configuration"}
          </Button>
        </div>
      </div>
    </div>
  );
}
