import { useState } from "react";
import { notify } from "../utils";
import { useProject } from "./use-project";

export function useConnect() {
  const { project } = useProject();
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = window.location.origin;
  const snippets = {
    environment: `ANVIA_LENS_BASE_URL=${baseUrl}\nANVIA_LENS_PUBLIC_KEY=<YOUR_PUBLIC_KEY>\nANVIA_LENS_SECRET_KEY=<YOUR_SECRET_KEY>\nANVIA_LENS_SERVICE_NAME=my-agent\nANVIA_LENS_ENVIRONMENT=production`,
    langfuse: `import { LangfuseSpanProcessor } from "@langfuse/otel";\nimport { startObservation } from "@langfuse/tracing";\nimport { NodeSDK } from "@opentelemetry/sdk-node";\n\nconst sdk = new NodeSDK({\n  spanProcessors: [new LangfuseSpanProcessor()],\n});\nsdk.start();\n\nconst agent = startObservation("support-agent", {\n  input: { message: "Hello" },\n}, { asType: "agent" });\nagent.end();\nawait sdk.shutdown();`,
    anvia: `import { createLensEvalReporter, lens } from "@anvia/lens";\n\nexport const tracing = lens.create();\nexport const evalReporter = createLensEvalReporter(tracing);\n\n// Pass tracing to an Anvia agent with .observe(tracing).\n// Pass evalReporter to runEvalSuite({ reporters: [evalReporter] }).\n// Flush or shut down before a short-lived process exits.`,
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    notify("Copied to clipboard");
    setTimeout(() => setCopied(null), 1500);
  };

  return { copied, copy, project, snippets };
}

export type ConnectState = ReturnType<typeof useConnect>;
