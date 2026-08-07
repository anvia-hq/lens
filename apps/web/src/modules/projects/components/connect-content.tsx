import { buttonVariants } from "@lens/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import {
  Pulse as Activity,
  ArrowRight,
  CheckCircle,
  Key as KeyRound,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Page } from "../../../components/page";
import type { ConnectState } from "../hooks/use-connect";
import { CodeBlock } from "./code-block";

const setupSteps = [
  {
    title: "Create an ingestion key",
    text: "Generate project-scoped credentials in Settings.",
  },
  {
    title: "Add the credentials",
    text: "Expose the Anvia Lens environment variables to your app.",
  },
  {
    title: "Instrument your runtime",
    text: "Choose an SDK and initialize tracing once at startup.",
  },
  {
    title: "Verify the connection",
    text: "Run your app and confirm that its first trace arrives.",
  },
];

export function ConnectContent({ state }: { state: ConnectState }) {
  const { copied, copy, project, snippets } = state;
  return (
    <Page
      eyebrow="Data ingestion"
      title="Connect your application"
      description={`Send native Anvia or Langfuse-compatible telemetry to ${project.name}`}
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
      <div className="grid overflow-hidden rounded-xl border bg-card xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-5 xl:border-r xl:border-b-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
              <TerminalWindow className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Connection checklist</h2>
              <p className="text-xs text-muted-foreground">Four steps to your first trace</p>
            </div>
          </div>

          <ol className="mt-6 grid gap-5">
            {setupSteps.map((step, index) => (
              <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3" key={step.title}>
                <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-secondary-foreground">
                  {index + 1}
                </span>
                <div className="grid gap-1 pt-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                  <span className="text-xs leading-5 text-muted-foreground">{step.text}</span>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 border-t pt-5">
            <div className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              <span>The secret key is shown once, so copy it before leaving Settings.</span>
            </div>
            <Link
              className={buttonVariants({ variant: "secondary", className: "w-full" })}
              to="/$projectId/settings"
              params={{ projectId: project.id }}
            >
              Create ingestion key
            </Link>
          </div>
        </aside>

        <div className="min-w-0 p-4 md:p-6">
          <div className="mx-auto grid max-w-4xl gap-8">
            <section className="grid gap-3" aria-labelledby="connect-credentials">
              <SectionHeading
                number="01"
                title="Configure credentials"
                description="Add these variables to your application environment using the key created for this project."
                id="connect-credentials"
              />
              <CodeBlock
                title="Environment variables"
                description=".env"
                code={snippets.environment}
                copied={copied === "environment"}
                onCopy={() => copy("environment", snippets.environment)}
              />
            </section>

            <section className="grid gap-3" aria-labelledby="connect-instrumentation">
              <SectionHeading
                number="02"
                title="Instrument your application"
                description="Initialize one tracing integration at application startup."
                id="connect-instrumentation"
              />
              <Tabs defaultValue="anvia">
                <TabsList className="w-full sm:w-fit">
                  <TabsTrigger value="anvia">Anvia Lens</TabsTrigger>
                  <TabsTrigger value="langfuse">Langfuse SDK</TabsTrigger>
                </TabsList>
                <TabsContent value="langfuse">
                  <CodeBlock
                    title="Langfuse OpenTelemetry"
                    description="@langfuse/otel"
                    code={snippets.langfuse}
                    copied={copied === "langfuse"}
                    onCopy={() => copy("langfuse", snippets.langfuse)}
                  />
                </TabsContent>
                <TabsContent value="anvia">
                  <CodeBlock
                    title="Native tracing and evaluations"
                    description="@anvia/lens"
                    code={snippets.anvia}
                    copied={copied === "anvia"}
                    onCopy={() => copy("anvia", snippets.anvia)}
                  />
                </TabsContent>
              </Tabs>
            </section>

            <section className="flex flex-col gap-4 rounded-xl border border-dashed bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-200 text-emerald-950 dark:bg-emerald-300 dark:text-emerald-950">
                  <Activity className="size-4" />
                </span>
                <div className="grid gap-1">
                  <h2 className="text-sm font-semibold">Send a test trace</h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Start your application and open Traces. New telemetry normally appears within a
                    few seconds.
                  </p>
                </div>
              </div>
              <Link
                className={buttonVariants({ variant: "outline", className: "shrink-0" })}
                to="/$projectId/traces"
                params={{ projectId: project.id }}
                search={{ range: "24h" }}
              >
                Check connection <CheckCircle />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </Page>
  );
}

function SectionHeading(props: { number: string; title: string; description: string; id: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="pt-0.5 font-mono text-xs font-medium text-muted-foreground">
        {props.number}
      </span>
      <div className="grid gap-1">
        <h2 className="font-heading text-base font-medium" id={props.id}>
          {props.title}
        </h2>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </div>
    </div>
  );
}
