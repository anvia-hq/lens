import type { CreatedProjectApiKey } from "@lens/contracts";
import { Alert, AlertDescription, AlertTitle } from "@lens/ui/components/alert";
import { Button } from "@lens/ui/components/button";
import {
  DangerCircle as AlertCircle,
  CheckCircle as Check,
  Copy,
  CloseCircle as X,
} from "@solar-icons/react";
import { useState } from "react";

export function SecretReveal(props: { credentials: CreatedProjectApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const environment = `LANGFUSE_BASE_URL=${window.location.origin}\nLANGFUSE_PUBLIC_KEY=${props.credentials.publicKey}\nLANGFUSE_SECRET_KEY=${props.credentials.secretKey}\nLANGFUSE_MEDIA_UPLOAD_ENABLED=false`;
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>Copy this key now</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>The secret key will not be shown again.</span>
        <code className="whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">
          {environment}
        </code>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(environment);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy environment"}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            <X /> Close
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
