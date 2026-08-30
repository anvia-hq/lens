import { describe, expect, it, vi } from "vitest";
import { queueHasCapacity } from "../src/modules/ingestion/capacity.js";

describe("ingestion queue capacity", () => {
  it("does not query Redis when the limit is disabled", async () => {
    const getWaitingCount = vi.fn();

    await expect(queueHasCapacity({ getWaitingCount }, 0)).resolves.toBe(true);
    expect(getWaitingCount).not.toHaveBeenCalled();
  });

  it("accepts below the limit and rejects at the limit", async () => {
    const getWaitingCount = vi.fn().mockResolvedValueOnce(499).mockResolvedValueOnce(500);

    await expect(queueHasCapacity({ getWaitingCount }, 500)).resolves.toBe(true);
    await expect(queueHasCapacity({ getWaitingCount }, 500)).resolves.toBe(false);
  });
});
