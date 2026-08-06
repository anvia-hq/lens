import { Button } from "@lens/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import { CheckCircle as Check, Copy } from "@solar-icons/react";

export function CodeBlock(props: {
  title: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={props.onCopy}>
            {props.copied ? <Check /> : <Copy />}
            {props.copied ? "Copied" : "Copy"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 rounded-lg bg-muted p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs">{props.code}</pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
