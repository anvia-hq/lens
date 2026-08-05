import { describe, expect, it } from "vitest";
import { materializeJobId } from "../src/index";

describe("queue contracts", () => {
  it("creates a stable materialization key", () => {
    expect(materializeJobId("project-1", "a".repeat(32))).toBe(
      `materialize-project-1-${"a".repeat(32)}`,
    );
  });
});
