import { useState } from "react";
import { notify } from "../utils";
import { useProject } from "./use-project";

export function useOnboarding() {
  const { project } = useProject();
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = window.location.origin;
  const snippets = {
    environment: `LANGFUSE_BASE_URL=${baseUrl}\nLANGFUSE_PUBLIC_KEY=<YOUR_PUBLIC_KEY>\nLANGFUSE_SECRET_KEY=<YOUR_SECRET_KEY>\nLANGFUSE_MEDIA_UPLOAD_ENABLED=false`,
    langfuse: `import { LangfuseSpanProcessor } from "@langfuse/otel";\nimport { startObservation } from "@langfuse/tracing";\nimport { NodeSDK } from "@opentelemetry/sdk-node";\n\nconst sdk = new NodeSDK({\n  spanProcessors: [new LangfuseSpanProcessor()],\n});\nsdk.start();\n\nconst agent = startObservation("support-agent", {\n  input: { message: "Hello" },\n}, { asType: "agent" });\nagent.end();\nawait sdk.shutdown();`,
    anvía: `import { langfuse } from "@anvia/langfuse";\n\nexport const tracing = langfuse.create({\n  serviceName: "my-agent",\n});\n\n// Pass tracing to an Anvia agent with .observe(tracing).\n// Call await tracing.shutdown() before a short-lived process exits.`,
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    notify("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };

  return { copied, copy, project, snippets };
}

export type OnboardingState = ReturnType<typeof useOnboarding>;
