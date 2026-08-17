import type { SystemMonitorSnapshot } from "@lens/contracts";
import { describe, expect, it, vi } from "vitest";
import { SnapshotCache } from "../src/snapshot-cache.js";

describe("snapshot cache", () => {
  it("invalidates a previous snapshot when collection fails", async () => {
    const error = new Error("host mounts unavailable");
    const source = {
      snapshot: vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(error),
    };
    const cache = new SnapshotCache(source);

    await cache.collect();
    expect(cache.latest()).toEqual(snapshot);

    await cache.collect();
    expect(cache.latest()).toBeUndefined();
    expect(cache.error()).toBe(error);
  });
});

const snapshot: SystemMonitorSnapshot = {
  version: 1,
  sampledAt: "2026-08-17T00:00:00.000Z",
  uptimeSeconds: 3_600,
  cpu: { usagePercent: 25, logicalCores: 4, load1: 0.5 },
  memory: { totalBytes: 1_000, usedBytes: 500, availableBytes: 500, usagePercent: 50 },
  swap: { totalBytes: 0, usedBytes: 0, availableBytes: 0, usagePercent: 0 },
  disk: { path: "/", totalBytes: 1_000, usedBytes: 500, availableBytes: 500, usagePercent: 50 },
};
