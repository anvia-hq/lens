import type { CreatedProjectApiKey } from "@lens/contracts";
import { Button } from "@lens/ui/components/button";
import { Check, Copy, Key as KeyRound, X } from "@phosphor-icons/react";
import { useState } from "react";

export function SecretReveal(props: { credentials: CreatedProjectApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const environment = `ANVIA_LENS_BASE_URL=${window.location.origin}\nANVIA_LENS_PUBLIC_KEY=${props.credentials.publicKey}\nANVIA_LENS_SECRET_KEY=${props.credentials.secretKey}\nANVIA_LENS_MEDIA_UPLOAD_ENABLED=false`;
  return (
    <div className="overflow-hidden rounded-xl border border-status-warning/40 bg-status-warning/10">
      <div className="flex items-start gap-3 border-b border-status-warning/30 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-status-warning-fill text-status-warning-fill-foreground">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Your new ingestion key is ready</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Copy these environment variables now. The secret key cannot be shown again.
          </p>
        </div>
        <Button
          aria-label="Close key details"
          size="icon-sm"
          variant="ghost"
          onClick={props.onClose}
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 p-4">
        <code className="overflow-x-auto whitespace-pre rounded-lg border bg-background/80 p-3 font-mono text-xs leading-5">
          {environment}
        </code>
        <div>
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(environment);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy environment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
