import { Badge } from "@lens/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import type { ReactNode } from "react";

export function CenteredCard(props: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full border bg-background text-foreground">
            {props.icon}
          </span>
          <Badge className="mx-auto mt-2" variant="secondary">
            {props.eyebrow}
          </Badge>
          <CardTitle className="mt-2 text-xl">{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">{props.children}</CardContent>
      </Card>
    </main>
  );
}
