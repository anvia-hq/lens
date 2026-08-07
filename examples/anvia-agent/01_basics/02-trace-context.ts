import { AgentBuilder } from "@anvia/core/agent";
import { lens } from "@anvia/lens";
import { createLiveModel } from "../_shared/model";

const model = createLiveModel();
const tracing = lens.create({ captureMode: "full" });
const agent = new AgentBuilder("support-summary-agent", model)
  .name("Support Summary Agent")
  .instructions("Summarize the supplied support ticket for an engineering team.")
  .observe(tracing)
  .build();

try {
  const response = await agent
    .prompt(
      "Ticket TICKET-1001: checkout remains disabled after address autocomplete until reload.",
    )
    .withTrace({
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
    })
    .send();
  await tracing.flush();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "not available");
  console.log("Open Lens > Sessions or Users to inspect the correlated context.");
} finally {
  await tracing.shutdown();
}
