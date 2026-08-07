import { Badge } from "@lens/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { cn } from "@lens/ui/lib/utils";
import type { ReactNode } from "react";
import { AnviaLensLogo } from "./anvia-lens-logo";

export function CenteredCard(props: {
  branded?: boolean;
  icon?: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "flex min-h-svh items-center justify-center p-4",
        props.branded ? "bg-background" : "bg-muted",
      )}
    >
      <div className="w-full max-w-md">
        {props.branded ? (
          <div className="mb-6 flex justify-center">
            <AnviaLensLogo />
          </div>
        ) : null}
        <Card className="w-full">
          <CardHeader className={cn(props.branded ? "gap-1" : "text-center")}>
            {props.branded ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {props.eyebrow}
              </p>
            ) : (
              <>
                <span className="mx-auto flex size-10 items-center justify-center rounded-full border bg-background text-foreground">
                  {props.icon}
                </span>
                <Badge className="mx-auto mt-2" variant="secondary">
                  {props.eyebrow}
                </Badge>
              </>
            )}
            <CardTitle className={cn(props.branded ? "text-2xl" : "mt-2 text-xl")}>
              {props.title}
            </CardTitle>
            <CardDescription>{props.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">{props.children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
