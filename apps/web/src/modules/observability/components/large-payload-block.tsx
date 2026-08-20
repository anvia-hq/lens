import { Button } from "@lens/ui/components/button";
import { Check, Copy, DownloadSimple as Download } from "@phosphor-icons/react";
import { useState } from "react";

export const LARGE_PAYLOAD_PREVIEW_CHARACTERS = 100_000;

export function LargePayloadBlock(props: { json: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const preview = props.json.slice(0, LARGE_PAYLOAD_PREVIEW_CHARACTERS);
  const download = () => {
    const url = URL.createObjectURL(new Blob([props.json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(props.title)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="relative min-w-0 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Large payload · showing the first {LARGE_PAYLOAD_PREVIEW_CHARACTERS.toLocaleString()}{" "}
          characters
        </p>
        <div className="flex shrink-0 gap-1">
          <Button
            aria-label={`Copy full ${props.title} JSON`}
            size="icon-sm"
            title={copied ? "Copied" : "Copy full JSON"}
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(props.json).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_500);
              });
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button
            aria-label={`Download full ${props.title} JSON`}
            size="icon-sm"
            title="Download full JSON"
            variant="ghost"
            onClick={download}
          >
            <Download />
          </Button>
        </div>
      </div>
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5">
        {preview}
        {props.json.length > preview.length ? "\n… display truncated" : ""}
      </pre>
    </div>
  );
}

function safeFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "") || "payload"
  );
}
