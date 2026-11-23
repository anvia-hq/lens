import { describe, expect, it } from "vitest";
import { extractPayloadPreview } from "../src/payload-preview.js";

describe("extractPayloadPreview", () => {
  it("returns null for empty or nullish payloads", () => {
    expect(extractPayloadPreview(null, "input")).toBeNull();
    expect(extractPayloadPreview(undefined, "output")).toBeNull();
    expect(extractPayloadPreview("   ", "input")).toBeNull();
  });

  it("extracts user and assistant text from OpenAI/Anvia message payloads", () => {
    const input = JSON.stringify({
      instructions: "Be concise",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Look up ticket TICKET-1001" },
      ],
    });
    const output = JSON.stringify({
      choices: [
        { message: { role: "assistant", content: "Ticket TICKET-1001 is high severity." } },
      ],
    });

    expect(extractPayloadPreview(input, "input")).toBe("Look up ticket TICKET-1001");
    expect(extractPayloadPreview(output, "output")).toBe("Ticket TICKET-1001 is high severity.");
  });

  it("extracts readable snippets from truncated JSON payloads and clips to maxLength", () => {
    const truncated = '{"messages":[{"role":"user","content":"Investigate checkout latency spike';
    expect(extractPayloadPreview(truncated, "input", 24)).toBe("Investigate checkout la…");
  });

  it("falls back to compact JSON for tool payloads without text keys", () => {
    const toolArgs = JSON.stringify({ ticketId: "TICKET-1001", includeComments: true });
    expect(extractPayloadPreview(toolArgs, "input")).toBe(
      '{"ticketId":"TICKET-1001","includeComments":true}',
    );
  });
});
