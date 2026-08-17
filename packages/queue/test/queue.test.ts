import type IORedis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listWorkerHeartbeats,
  materializeJobId,
  queryQueueHealth,
  queueNames,
  startWorkerHeartbeat,
} from "../src/index";

describe("queue contracts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a stable materialization key", () => {
    expect(materializeJobId("project-1", "a".repeat(32))).toBe(
      `materialize-project-1-${"a".repeat(32)}`,
    );
  });

  it("keeps long-running cost work on a dedicated queue", () => {
    expect(queueNames.costs).toBe("lens-model-costs");
    expect(queueNames.costs).not.toBe(queueNames.maintenance);
  });

  it("registers and removes a worker heartbeat", async () => {
    const redis = {
      status: "ready",
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    } as unknown as IORedis;
    const heartbeat = startWorkerHeartbeat(redis, "worker-1", { intervalMs: 60_000 });

    expect(redis.set).toHaveBeenCalledWith(
      "lens:worker:heartbeat:worker-1",
      expect.any(String),
      "PX",
      30_000,
    );
    await heartbeat.close();
    expect(redis.del).toHaveBeenCalledWith("lens:worker:heartbeat:worker-1");
  });

  it("keeps heartbeat failures best-effort during registration, renewal, and cleanup", async () => {
    vi.useFakeTimers();
    const redis = {
      status: "ready",
      set: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      del: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as unknown as IORedis;
    const heartbeat = startWorkerHeartbeat(redis, "worker-2", {
      intervalMs: 10_000,
      ttlMs: 20_000,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenLastCalledWith(
      "lens:worker:heartbeat:worker-2",
      expect.any(String),
      "PX",
      20_000,
    );
    await expect(heartbeat.close()).resolves.toBeUndefined();
  });

  it("uses heartbeat defaults when no timing options are supplied", async () => {
    vi.useFakeTimers();
    const redis = {
      status: "ready",
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
    } as unknown as IORedis;
    const heartbeat = startWorkerHeartbeat(redis, "worker-defaults");

    expect(redis.set).toHaveBeenCalledWith(
      "lens:worker:heartbeat:worker-defaults",
      expect.any(String),
      "PX",
      30_000,
    );
    await heartbeat.close();
  });

  it("bounds heartbeat cleanup when Redis stops responding", async () => {
    vi.useFakeTimers();
    const redis = {
      status: "ready",
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as IORedis;
    const heartbeat = startWorkerHeartbeat(redis, "worker-hanging");

    const closing = heartbeat.close();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(closing).resolves.toBeUndefined();
  });

  it("skips heartbeat cleanup when Redis is disconnected", async () => {
    vi.useFakeTimers();
    const redis = {
      status: "reconnecting",
      set: vi.fn().mockRejectedValue(new Error("redis unavailable")),
      del: vi.fn(),
    } as unknown as IORedis;
    const heartbeat = startWorkerHeartbeat(redis, "worker-disconnected");

    await heartbeat.close();

    expect(redis.del).not.toHaveBeenCalled();
  });

  it("lists live workers and reports every queue", async () => {
    const redis = {
      scan: vi.fn().mockResolvedValue(["0", ["lens:worker:heartbeat:a"]]),
      mget: vi.fn().mockResolvedValue(["2026-08-17T00:00:00.000Z"]),
    } as unknown as IORedis;
    await expect(listWorkerHeartbeats(redis)).resolves.toEqual(["2026-08-17T00:00:00.000Z"]);

    const queue = {
      getWaitingCount: vi.fn().mockResolvedValue(1),
      getActiveCount: vi.fn().mockResolvedValue(2),
      getDelayedCount: vi.fn().mockResolvedValue(3),
      getFailedCount: vi.fn().mockResolvedValue(4),
    };
    const queues = {
      ingest: queue,
      evaluations: queue,
      materialize: queue,
      maintenance: queue,
      costs: queue,
      alerts: queue,
    };
    const health = await queryQueueHealth(queues as never);
    expect(health).toHaveLength(6);
    expect(health[0]).toEqual({
      name: "Trace ingestion",
      waiting: 1,
      active: 2,
      delayed: 3,
      failed: 4,
    });
  });

  it("paginates, filters, and sorts worker heartbeats", async () => {
    const redis = {
      scan: vi
        .fn()
        .mockResolvedValueOnce(["7", ["lens:worker:heartbeat:a", "lens:worker:heartbeat:expired"]])
        .mockResolvedValueOnce(["0", ["lens:worker:heartbeat:b"]]),
      mget: vi
        .fn()
        .mockResolvedValue(["2026-08-17T00:00:00.000Z", null, "2026-08-18T00:00:00.000Z"]),
    } as unknown as IORedis;

    await expect(listWorkerHeartbeats(redis)).resolves.toEqual([
      "2026-08-18T00:00:00.000Z",
      "2026-08-17T00:00:00.000Z",
    ]);
    expect(redis.scan).toHaveBeenNthCalledWith(
      2,
      "7",
      "MATCH",
      "lens:worker:heartbeat:*",
      "COUNT",
      100,
    );
  });

  it("returns no workers without reading heartbeat values when no keys exist", async () => {
    const redis = {
      scan: vi.fn().mockResolvedValue(["0", []]),
      mget: vi.fn(),
    } as unknown as IORedis;

    await expect(listWorkerHeartbeats(redis)).resolves.toEqual([]);
    expect(redis.mget).not.toHaveBeenCalled();
  });
});
