import { describe, expect, it } from "vitest";
import {
  promptContentSchema,
  promptDeploymentQuerySchema,
  promptUpdateSchema,
  promptVersionCommitSchema,
  resolvedPromptSchema,
} from "../src/index.js";

describe("prompt contracts", () => {
  it("enforces discriminated text and chat content", () => {
    expect(promptContentSchema.safeParse({ type: "text", template: "Hi {{name}}" }).success).toBe(
      true,
    );
    expect(promptContentSchema.safeParse({ type: "text", template: "   " }).success).toBe(false);
    expect(
      promptContentSchema.safeParse({
        type: "chat",
        messages: [{ role: "user", content: "Hello" }],
      }).success,
    ).toBe(true);
    expect(
      promptContentSchema.safeParse({ type: "text", template: "Hi", messages: [] }).success,
    ).toBe(false);
    expect(
      promptContentSchema.safeParse({ type: "chat", template: "Hi", messages: [] }).success,
    ).toBe(false);
  });

  it("validates commits, updates, and deployment selectors", () => {
    expect(
      promptVersionCommitSchema.parse({
        type: "chat",
        messages: [{ role: "assistant", content: "Hello" }],
        changeMessage: " Initial ",
      }),
    ).toMatchObject({ changeMessage: "Initial" });
    expect(promptUpdateSchema.safeParse({}).success).toBe(false);
    expect(promptUpdateSchema.parse({ description: " Updated " })).toEqual({
      description: "Updated",
    });
    expect(promptDeploymentQuerySchema.parse({ version: "5" })).toEqual({ version: 5 });
    expect(
      promptDeploymentQuerySchema.safeParse({ label: "production", version: "5" }).success,
    ).toBe(false);
  });

  it("requires resolved text prompts to carry a nonblank template", () => {
    const resolved = {
      name: "support/reply",
      version: 5,
      config: {},
      labels: [],
      selector: { version: 5 },
      type: "text",
      template: "Hello",
      messages: null,
    };
    expect(resolvedPromptSchema.safeParse(resolved).success).toBe(true);
    expect(resolvedPromptSchema.safeParse({ ...resolved, template: "   " }).success).toBe(false);
  });
});
