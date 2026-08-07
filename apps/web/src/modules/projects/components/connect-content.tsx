import { buttonVariants } from "@lens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { ArrowRight, Key as KeyRound } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Page } from "../../../components/page";
import type { ConnectState } from "../hooks/use-connect";
import { CodeBlock } from "./code-block";

export function ConnectContent({ state }: { state: ConnectState }) {
  const { copied, copy, project, snippets } = state;
  return (
    <Page
      title="Connect"
      description={`Send telemetry from your application to ${project.name}.`}
      headerClassName="mx-auto w-full max-w-4xl"
      action={
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/$projectId/traces"
          params={{ projectId: project.id }}
          search={{ range: "24h" }}
        >
          View traces <ArrowRight />
        </Link>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card>
          <CardHeader className="gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-1">
              <CardTitle>1. Add your credentials</CardTitle>
              <CardDescription>
                Create an ingestion key, then add these variables to your application.
              </CardDescription>
            </div>
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              to="/$projectId/settings"
              params={{ projectId: project.id }}
            >
              <KeyRound /> Manage keys
            </Link>
          </CardHeader>
          <CardContent>
            <CodeBlock
              title="Environment variables"
              description=".env"
              code={snippets.environment}
              copied={copied === "environment"}
              onCopy={() => copy("environment", snippets.environment)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Add instrumentation</CardTitle>
            <CardDescription>
              Initialize one integration when your application starts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="anvia">
              <TabsList>
                <TabsTrigger value="anvia">Anvia Lens</TabsTrigger>
                <TabsTrigger value="langfuse">Langfuse</TabsTrigger>
              </TabsList>
              <TabsContent value="anvia">
                <CodeBlock
                  title="Native tracing and evaluations"
                  description="@anvia/lens"
                  code={snippets.anvia}
                  copied={copied === "anvia"}
                  onCopy={() => copy("anvia", snippets.anvia)}
                />
              </TabsContent>
              <TabsContent value="langfuse">
                <CodeBlock
                  title="Langfuse OpenTelemetry"
                  description="@langfuse/otel"
                  code={snippets.langfuse}
                  copied={copied === "langfuse"}
                  onCopy={() => copy("langfuse", snippets.langfuse)}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="px-1 text-sm text-muted-foreground">
          Start your application after setup. The first trace should appear within a few seconds.
        </p>
      </div>
    </Page>
  );
}
