import { describe, expect, it } from "vitest";
import {
  type CollectedDisk,
  capacity,
  cpuUsagePercent,
  deduplicateDisks,
  parseCpuStat,
  parseMeminfo,
} from "../src/host.js";

describe("host metric parsing", () => {
  it("calculates CPU usage from host jiffy deltas", () => {
    const first = parseCpuStat(
      "cpu  100 10 40 800 20 0 0 0 0 0\ncpu0 50 5 20 400 10 0 0 0 0 0\ncpu1 50 5 20 400 10 0 0 0 0 0\n",
    );
    const second = parseCpuStat(
      "cpu  140 10 60 860 20 0 0 0 0 0\ncpu0 70 5 30 430 10 0 0 0 0 0\ncpu1 70 5 30 430 10 0 0 0 0 0\n",
    );

    expect(first.logicalCores).toBe(2);
    expect(cpuUsagePercent(undefined, first)).toBeNull();
    expect(cpuUsagePercent(first, second)).toBe(50);
  });

  it("does not count Linux guest time twice", () => {
    const first = parseCpuStat("cpu  100 0 0 100 0 0 0 0 50 0\ncpu0 100 0 0 100 0 0 0 0 50 0\n");
    const second = parseCpuStat("cpu  200 0 0 200 0 0 0 0 150 0\ncpu0 200 0 0 200 0 0 0 0 150 0\n");

    expect(cpuUsagePercent(first, second)).toBe(50);
  });

  it("reads available memory and swap in bytes", () => {
    expect(
      parseMeminfo(
        "MemTotal:       1000 kB\nMemAvailable:    250 kB\nSwapTotal:       500 kB\nSwapFree:        400 kB\n",
      ),
    ).toEqual({
      total: 1_024_000,
      available: 256_000,
      swapTotal: 512_000,
      swapFree: 409_600,
    });
  });

  it("clamps capacity and handles an unavailable total", () => {
    expect(capacity(1_000, 200)).toEqual({
      totalBytes: 1_000,
      usedBytes: 800,
      availableBytes: 200,
      usagePercent: 80,
    });
    expect(capacity(0, 0).usagePercent).toBe(0);
  });

  it("deduplicates bind mounts that resolve to the same filesystem", () => {
    const disk = (device: number, name: string): CollectedDisk => ({
      device,
      name,
      path: name === "Root disk" ? "/" : "/var/lib/docker",
      totalBytes: 1_000,
      usedBytes: 500,
      availableBytes: 500,
      usagePercent: 50,
    });

    expect(deduplicateDisks([disk(1, "Root disk"), disk(1, "Docker data")])).toHaveLength(1);
    expect(deduplicateDisks([disk(1, "Root disk"), disk(2, "Docker data")])).toHaveLength(2);
  });
});
