import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const redisInstances: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const queueInstances: Array<{
    close: ReturnType<typeof vi.fn>;
    name: string;
    options: Record<string, unknown>;
  }> = [];

  class Redis {
    disconnect = vi.fn();

    constructor(
      public readonly url: string,
      public readonly options: Record<string, unknown>,
    ) {
      redisInstances.push(this);
    }
  }

  class Queue {
    close = vi.fn().mockResolvedValue(undefined);

    constructor(
      public readonly name: string,
      public readonly options: Record<string, unknown>,
    ) {
      queueInstances.push(this);
    }
  }

  return { Queue, Redis, queueInstances, redisInstances };
});

vi.mock("ioredis", () => ({ default: mocks.Redis }));
vi.mock("bullmq", () => ({ Queue: mocks.Queue }));

import { createQueues, createRedisConnection, queueNames } from "../src/index";

describe("queue lifecycle", () => {
  beforeEach(() => {
    mocks.queueInstances.length = 0;
    mocks.redisInstances.length = 0;
  });

  it("creates Redis with worker-safe options", () => {
    const redis = createRedisConnection("redis://cache:6379");

    expect(redis).toMatchObject({
      url: "redis://cache:6379",
      options: { enableReadyCheck: true, maxRetriesPerRequest: null },
    });
  });

  it("allows callers to bound health-only Redis commands", () => {
    const redis = createRedisConnection("redis://cache:6379", {
      commandTimeout: 2_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    expect(redis).toMatchObject({
      options: {
        commandTimeout: 2_000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      },
    });
  });

  it("creates and closes every queue before disconnecting Redis", async () => {
    const queues = createQueues("redis://cache:6379");

    expect(mocks.queueInstances.map(({ name }) => name)).toEqual(Object.values(queueNames));
    expect(mocks.queueInstances[0]?.options).toMatchObject({
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
      },
    });

    await queues.close();

    for (const queue of mocks.queueInstances) expect(queue.close).toHaveBeenCalledOnce();
    expect(mocks.redisInstances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects Redis when a queue fails to close", async () => {
    const queues = createQueues("redis://cache:6379");
    mocks.queueInstances[0]?.close.mockRejectedValueOnce(new Error("queue close failed"));

    await expect(queues.close()).rejects.toThrow("queue close failed");
    expect(mocks.redisInstances[0]?.disconnect).toHaveBeenCalledOnce();
  });
});
