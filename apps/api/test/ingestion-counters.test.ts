import type IORedis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import {
  readIngestionRejections,
  recordIngestionRejection,
} from "../src/modules/ingestion/counters.js";

function redis(values: Record<string, string> = {}) {
  return {
    multi: vi.fn().mockReturnThis(),
    incrby: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
    mget: vi.fn(async (...keys: string[]) => keys.map((key) => values[key] ?? null)),
  } as unknown as IORedis & { mget: ReturnType<typeof vi.fn> };
}

const now = new Date("2026-08-17T03:00:00.000Z");

describe("ingestion rejection counters", () => {
  it("records rejections into a daily redis key", async () => {
    const client = redis();
    await recordIngestionRejection(client as unknown as IORedis, "rate_limit", 3, now);
    expect(client.incrby).toHaveBeenCalledWith("lens:ingest:rejected:2026-08-17:rate_limit", 3);
    expect(client.expire).toHaveBeenCalled();
  });

  it("sums today and yesterday keys and skips empty reasons", async () => {
    const client = redis({
      "lens:ingest:rejected:2026-08-17:auth": "2",
      "lens:ingest:rejected:2026-08-16:auth": "1",
      "lens:ingest:rejected:2026-08-16:decode": "5",
    });
    const counters = await readIngestionRejections(client as unknown as IORedis, now);
    expect(counters).toEqual([
      { reason: "decode", count: 5 },
      { reason: "auth", count: 3 },
    ]);
  });

  it("swallows counter failures instead of failing ingestion", async () => {
    const failing = {
      multi: vi.fn(() => {
        throw new Error("redis down");
      }),
    };
    await expect(
      recordIngestionRejection(failing as unknown as IORedis, "auth", 1, now),
    ).resolves.toBeUndefined();
  });
});
