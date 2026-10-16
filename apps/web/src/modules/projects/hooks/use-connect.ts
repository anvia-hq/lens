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
    anvia: `import { Agent } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { OpenAIClient } from "@anvia/openai";

// Set OPENAI_API_KEY and OPENAI_MODEL alongside the Lens environment variables.
const tracing = new LensClient();
const openai = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY! });
const agent = new Agent({
  id: "support-agent",
  model: openai.completionModel({ modelId: process.env.OPENAI_MODEL!, api: "chat" }),
  observability: {
    observers: { lens: tracing.observer() },
    primaryTrace: "lens",
  },
});

// For evaluations, pass tracing.evalReporter() to runEvalSuite({ reporters: [...] })
// and finish the suite before closing the client.
try {
  const result = await agent.generate({ prompt: "How do refunds work?" });
  if (result.type !== "response") {
    throw new Error(\`Agent did not produce a response: \${result.type}\`);
  }
  console.log(result.output, result.trace?.traceId);
} finally {
  await tracing.close();
}`,
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
