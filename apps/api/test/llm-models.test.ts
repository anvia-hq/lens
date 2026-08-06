import { describe, expect, it } from "vitest";
import { modelPriceSchema, recalculationSchema } from "../src/modules/llm-models/schema.js";

describe("LLM model request schemas", () => {
  it("accepts separate input, cached-input, and output rates", () => {
    expect(
      modelPriceSchema.parse({
        model: " zai-api/glm-5.2 ",
        inputPricePerMillion: 1.5,
        cachedInputPricePerMillion: 0.25,
        outputPricePerMillion: 8,
      }),
    ).toEqual({
      model: "zai-api/glm-5.2",
      inputPricePerMillion: 1.5,
      cachedInputPricePerMillion: 0.25,
      outputPricePerMillion: 8,
    });
  });

  it("requires complete, ascending recalculation ranges", () => {
    expect(recalculationSchema.safeParse({}).success).toBe(true);
    expect(recalculationSchema.safeParse({ from: "2026-08-01T00:00:00.000Z" }).success).toBe(false);
    expect(
      recalculationSchema.safeParse({
        from: "2026-08-02T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
