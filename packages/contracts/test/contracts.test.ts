import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, projectSettingsSchema } from "../src/index";

describe("contracts", () => {
  it("round-trips an opaque trace cursor", () => {
    const cursor = encodeCursor("2026-08-05T00:00:00.000Z", "a".repeat(32));
    expect(decodeCursor(cursor)).toEqual({
      startedAt: "2026-08-05T00:00:00.000Z",
      traceId: "a".repeat(32),
    });
  });

  it("validates supported retention options", () => {
    expect(
      projectSettingsSchema.safeParse({ retentionDays: 30, redactionPatterns: [] }).success,
    ).toBe(true);
    expect(
      projectSettingsSchema.safeParse({ retentionDays: 14, redactionPatterns: [] }).success,
    ).toBe(false);
  });
});
