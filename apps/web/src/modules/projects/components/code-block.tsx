import { Button } from "@lens/ui/components/button";
import { Check, Copy } from "@phosphor-icons/react";

export function CodeBlock(props: {
  title: string;
  description?: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-medium">{props.title}</span>
          {props.description ? (
            <span className="font-mono text-[11px] text-muted-foreground">{props.description}</span>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={props.onCopy}>
          {props.copied ? <Check /> : <Copy />}
          {props.copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="max-h-80 overflow-auto">
        <pre className="min-w-max p-4 font-mono text-xs leading-5">{props.code}</pre>
      </div>
    </div>
  );
}
