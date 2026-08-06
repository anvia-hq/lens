import { describe, expect, it } from "vitest";
import { materializeJobId, queueNames } from "../src/index";

describe("queue contracts", () => {
  it("creates a stable materialization key", () => {
    expect(materializeJobId("project-1", "a".repeat(32))).toBe(
      `materialize-project-1-${"a".repeat(32)}`,
    );
  });

  it("keeps long-running cost work on a dedicated queue", () => {
    expect(queueNames.costs).toBe("lens-model-costs");
    expect(queueNames.costs).not.toBe(queueNames.maintenance);
  });
});
