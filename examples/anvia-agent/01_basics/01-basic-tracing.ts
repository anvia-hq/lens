import { AgentBuilder } from "@anvia/core/agent";
import { lens } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

// Full capture makes the synthetic prompt and response visible in Lens.
const model = createLiveModel();
const tracing = lens.create({ captureMode: "full" });
const agent = new AgentBuilder("lens-basic-agent", model)
  .name("Lens Basic Agent")
  .instructions("Answer clearly in two sentences or fewer.")
  .observe(tracing)
  .build();

try {
  const response = await agent.prompt("What does observability add to an AI agent?").send();
  await tracing.flush();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "not available");
} finally {
  await tracing.shutdown();
}
