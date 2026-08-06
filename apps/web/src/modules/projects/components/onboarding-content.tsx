import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lens/ui/components/tabs";
import { Page } from "../../../components/page";
import type { OnboardingState } from "../hooks/use-onboarding";
import { CodeBlock } from "./code-block";
import { OnboardingStep as Step } from "./onboarding-step";
export function OnboardingContent({ state }: { state: OnboardingState }) {
  const { copied, copy, project, snippets } = state;
  return (
    <Page
      title="Connect an application"
      description={`Send Langfuse OTLP traces to ${project.name}`}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Step
          number="01"
          title="Create an ingestion key"
          text="Generate a project-scoped key in Settings. The secret is shown once."
        />
        <Step
          number="02"
          title="Configure your exporter"
          text="Use the standard Langfuse base URL, public key, and secret key variables."
        />
        <Step
          number="03"
          title="Run your application"
          text="Traces normally appear in the explorer within a few seconds."
        />
      </div>
      <Tabs defaultValue="environment">
        <TabsList>
          <TabsTrigger value="environment">Environment</TabsTrigger>
          <TabsTrigger value="langfuse">Langfuse OTEL</TabsTrigger>
          <TabsTrigger value="anvia">Anvia</TabsTrigger>
        </TabsList>
        <TabsContent value="environment">
          <CodeBlock
            title="Environment"
            code={snippets.environment}
            copied={copied === "env"}
            onCopy={() => copy("env", snippets.environment)}
          />
        </TabsContent>
        <TabsContent value="langfuse">
          <CodeBlock
            title="@langfuse/otel"
            code={snippets.langfuse}
            copied={copied === "langfuse"}
            onCopy={() => copy("langfuse", snippets.langfuse)}
          />
        </TabsContent>
        <TabsContent value="anvia">
          <CodeBlock
            title="@anvia/langfuse"
            code={snippets.anvía}
            copied={copied === "anvia"}
            onCopy={() => copy("anvia", snippets.anvía)}
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
