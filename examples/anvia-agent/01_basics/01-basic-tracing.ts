import { Agent } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

// Full capture makes the synthetic prompt and response visible in Lens.
const model = createLiveModel();
const tracing = new LensClient();
const agent = new Agent({
  id: "lens-basic-agent",
  model,
  name: "Lens Basic Agent",
  instructions: "Answer clearly in two sentences or fewer.",
  observability: {
    observers: { lens: tracing.observer({ captureMode: "full" }) },
    primaryTrace: "lens",
  },
});

try {
  const response = await agent.generate({ prompt: "What does observability add to an AI agent?" });
  if (response.type !== "response") {
    throw new Error(`Agent did not produce a response: ${response.type}`);
  }
  await tracing.flush();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "not available");
} finally {
  await tracing.close();
}
