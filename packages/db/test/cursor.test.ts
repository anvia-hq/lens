import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/cursor.js";

describe("trace cursors", () => {
  it("round-trips an opaque cursor", () => {
    const cursor = encodeCursor("2026-08-05T00:00:00.000Z", "a".repeat(32));
    expect(decodeCursor(cursor)).toEqual({
      startedAt: "2026-08-05T00:00:00.000Z",
      traceId: "a".repeat(32),
    });
  });

  it.each([
    "not-json",
    Buffer.from(JSON.stringify([])).toString("base64url"),
    Buffer.from(JSON.stringify(["timestamp"])).toString("base64url"),
    Buffer.from(JSON.stringify(["timestamp", 42])).toString("base64url"),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined();
  });
});
