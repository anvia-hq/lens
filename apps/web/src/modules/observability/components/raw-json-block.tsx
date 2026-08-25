import { Button } from "@lens/ui/components/button";
import { cn } from "@lens/ui/lib/utils";
import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { jsonSyntaxTokens, rawTraceJson } from "../utils/trace-detail";

export function RawJsonBlock({ title, value }: { title: string; value: unknown }) {
  const json = rawTraceJson(value);
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-w-0 rounded-lg border bg-muted/20">
      <Button
        aria-label={`Copy ${title} JSON`}
        className="absolute right-2 top-2 z-10"
        size="icon-sm"
        title={copied ? "Copied" : "Copy JSON"}
        variant="secondary"
        onClick={() => {
          void navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          });
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <pre className="max-h-[32rem] overflow-auto p-4 pr-12 font-mono text-xs leading-5 text-syntax-base">
        {jsonSyntaxTokens(json).map((token) => (
          <span
            className={cn(
              token.type === "key" && "text-syntax-key",
              token.type === "string" && "text-syntax-string",
              token.type === "number" && "text-syntax-number",
              token.type === "boolean" && "text-syntax-literal",
              token.type === "null" && "text-syntax-comment",
            )}
            key={token.start}
          >
            {token.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
