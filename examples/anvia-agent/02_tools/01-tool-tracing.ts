import { Agent } from "@anvia/core/agent";
import { createTool } from "@anvia/core/tool";
import { LensClient } from "@anvia/lens";
import { z } from "zod";
import { createLiveModel } from "../_shared/model";

const getTicket = createTool({
  name: "get_ticket",
  description: "Look up a support ticket by ID.",
  inputSchema: z.object({
    id: z.string().describe("The support ticket ID"),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string(),
  }),
  execute: ({ id }) => ({
    id,
    title: "Checkout disabled after address autocomplete",
    severity: "high" as const,
    summary: "Checkout remains disabled until the customer reloads the page.",
  }),
});

const model = createLiveModel();
const tracing = new LensClient();
const agent = new Agent({
  id: "ticket-triage-agent",
  model,
  name: "Ticket Triage Agent",
  instructions: "Use the ticket tool, then provide a concise engineering triage summary.",
  tools: [getTicket],
  maxTurns: 3,
  observability: {
    observers: { lens: tracing.observer({ captureMode: "full" }) },
    primaryTrace: "lens",
  },
});

try {
  const response = await agent.generate({
    prompt: "Use get_ticket to inspect TICKET-1001 and summarize the priority.",
    trace: {
      name: "ticket-triage",
      tags: ["lens-example", "tool-call"],
      metadata: { ticketId: "TICKET-1001", synthetic: true },
    },
  });
  if (response.type !== "response") {
    throw new Error(`Agent did not produce a response: ${response.type}`);
  }
  await tracing.flush();

  console.log(response.output);
  console.log("trace:", response.trace?.traceId ?? "not available");
  console.log("Open the trace to inspect its agent, generation, and tool observations.");
} finally {
  await tracing.close();
}
