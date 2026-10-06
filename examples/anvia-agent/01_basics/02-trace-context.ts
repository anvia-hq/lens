import { Agent } from "@anvia/core/agent";
import { LensClient } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

const model = createLiveModel();
const tracing = new LensClient();
const agent = new Agent({
  id: "support-summary-agent",
  model,
  name: "Support Summary Agent",
  instructions: "Summarize the supplied support ticket for an engineering team.",
  observability: {
    observers: { lens: tracing.observer({ captureMode: "full" }) },
    primaryTrace: "lens",
  },
});

try {
  const response = await agent.generate({
    prompt:
      "Ticket TICKET-1001: checkout remains disabled after address autocomplete until reload.",
    trace: {
      name: "support-ticket-summary",
      userId: "example-user-42",
      sessionId: "example-session-1001",
      tags: ["lens-example", "support"],
      version: "v1",
      metadata: {
        ticketId: "TICKET-1001",
        team: "checkout",
        synthetic: true,
      },
    },
  });
  if (response.type !== "response") {
    throw new Error(`Agent did not produce a response: ${response.type}`);
  }
  await tracing.flush();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "not available");
  console.log("Open Lens > Sessions or Users to inspect the correlated context.");
} finally {
  await tracing.close();
}
