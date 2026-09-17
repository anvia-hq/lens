import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const redisInstances: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const queueInstances: Array<{
    add: ReturnType<typeof vi.fn>;
    addBulk: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    name: string;
    options: Record<string, unknown>;
    rawAdd: ReturnType<typeof vi.fn>;
    rawAddBulk: ReturnType<typeof vi.fn>;
    rawUpsertJobScheduler: ReturnType<typeof vi.fn>;
    upsertJobScheduler: ReturnType<typeof vi.fn>;
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
    rawAdd = vi.fn().mockResolvedValue({ id: "job" });
    add = this.rawAdd;
    rawAddBulk = vi.fn().mockResolvedValue([]);
    addBulk = this.rawAddBulk;
    close = vi.fn().mockResolvedValue(undefined);
    rawUpsertJobScheduler = vi.fn().mockResolvedValue({ id: "scheduled-job" });
    upsertJobScheduler = this.rawUpsertJobScheduler;

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
    const queues = createQueues(
      "redis://cache:6379",
      {},
      {
        completedAgeSeconds: 300,
        completedCount: 500,
        failedAgeSeconds: 86_400,
        failedCount: 750,
      },
    );

    expect(mocks.queueInstances.map(({ name }) => name)).toEqual(Object.values(queueNames));
    expect(mocks.queueInstances[0]?.options).toMatchObject({
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 300, count: 500 },
        removeOnFail: { age: 86_400, count: 750 },
      },
    });

    await queues.close();

    for (const queue of mocks.queueInstances) expect(queue.close).toHaveBeenCalledOnce();
    expect(mocks.redisInstances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects Redis when a queue fails to close", async () => {
    const queues = createQueues("redis://cache:6379");
    mocks.queueInstances[0]?.close.mockRejectedValueOnce(new Error("queue close failed"));

    await expect(queues.close()).rejects.toThrow("One or more queues failed to close");
    for (const queue of mocks.queueInstances) expect(queue.close).toHaveBeenCalledOnce();
    expect(mocks.redisInstances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("closes idempotently and validates retention options", async () => {
    const queues = createQueues("redis://cache:6379");
    await Promise.all([queues.close(), queues.close()]);
    for (const queue of mocks.queueInstances) expect(queue.close).toHaveBeenCalledOnce();
    expect(mocks.redisInstances[0]?.disconnect).toHaveBeenCalledOnce();

    expect(() => createQueues("redis://cache:6379", {}, { completedCount: -1 })).toThrow(
      "completedCount must be a non-negative safe integer",
    );
  });

  it("validates and versions jobs before they reach Redis", async () => {
    const queues = createQueues("redis://cache:6379");
    const projectId = "00000000-0000-4000-8000-000000000001";

    await queues.materialize.add("materialize", { projectId, traceId: "a".repeat(32) });
    expect(mocks.queueInstances[2]?.rawAdd).toHaveBeenCalledWith(
      "materialize",
      { schemaVersion: 1, projectId, traceId: "a".repeat(32) },
      undefined,
    );

    await expect(
      queues.materialize.add("materialize", { projectId, traceId: "short" }),
    ).rejects.toThrow();
    expect(mocks.queueInstances[2]?.rawAdd).toHaveBeenCalledOnce();

    await queues.maintenance.addBulk([
      { name: "reconcile-retention", data: { projectId } },
      { name: "delete-project", data: { projectId } },
    ]);
    expect(mocks.queueInstances[3]?.rawAddBulk).toHaveBeenCalledWith([
      { name: "reconcile-retention", data: { schemaVersion: 1, projectId } },
      { name: "delete-project", data: { schemaVersion: 1, projectId } },
    ]);

    await queues.alerts.upsertJobScheduler(
      "alerts-every-minute",
      { every: 60_000 },
      { name: "evaluate-alert-rules", data: {} },
    );
    expect(mocks.queueInstances[5]?.rawUpsertJobScheduler).toHaveBeenCalledWith(
      "alerts-every-minute",
      { every: 60_000 },
      { name: "evaluate-alert-rules", data: { schemaVersion: 1 } },
    );

    await expect(queues.alerts.add("unknown" as "evaluate-alert-rules", {})).rejects.toThrow(
      'Unknown job name "unknown" for queue "alerts"',
    );
    expect(mocks.queueInstances[5]?.rawAdd).not.toHaveBeenCalled();
  });
});
