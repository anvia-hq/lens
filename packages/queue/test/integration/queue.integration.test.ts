import type { NormalizedSpan } from "@lens/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createQueues,
  type LensQueues,
  materializeJobId,
  queryQueueHealth,
  queueNames,
} from "../../src/index.js";

describe("queue integration", () => {
  let queues: LensQueues;

  beforeAll(() => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl === undefined) throw new Error("REDIS_URL is required for integration tests");
    queues = createQueues(redisUrl);
  });

  afterAll(async () => {
    await Promise.all(
      [
        queues.ingest,
        queues.evaluations,
        queues.materialize,
        queues.maintenance,
        queues.costs,
        queues.alerts,
        queues.dispatch,
      ].map((queue) => queue.obliterate({ force: true })),
    );
    await queues.close();
  });

  it("persists jobs on every typed queue with production defaults", async () => {
    const jobs = await Promise.all([
      queues.ingest.add("ingest", {
        projectId: "00000000-0000-4000-8000-000000000001",
        ingestId: "ingest-1",
        receivedAt: "2026-08-07T00:00:00.000Z",
        spans: [normalizedSpan()],
      }),
      queues.evaluations.add("ingest", {
        projectId: "00000000-0000-4000-8000-000000000001",
        ingestId: "evaluation-1",
        receivedAt: "2026-08-07T00:00:00.000Z",
        evaluations: [],
        runs: [],
      }),
      queues.materialize.add(
        "materialize",
        {
          projectId: "00000000-0000-4000-8000-000000000001",
          traceId: "a".repeat(32),
        },
        { jobId: materializeJobId("00000000-0000-4000-8000-000000000001", "a".repeat(32)) },
      ),
      queues.maintenance.add("reconcile-retention", {
        projectId: "00000000-0000-4000-8000-000000000001",
      }),
      queues.costs.add("recalculate-model-costs", {
        recalculationId: "00000000-0000-4000-8000-000000000002",
      }),
      queues.alerts.add("evaluate-alert-rules", {
        projectId: "00000000-0000-4000-8000-000000000001",
      }),
      queues.dispatch.add("dispatch-alert", {
        deliveryId: "00000000-0000-4000-8000-000000000003",
      }),
    ]);

    expect(jobs.map((job) => job.queueName)).toEqual(Object.values(queueNames));
    for (const job of jobs) {
      expect(job.data).toMatchObject({ schemaVersion: 1 });
      expect(job.opts).toMatchObject({
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 10_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      });
    }
    expect(await queues.materialize.getJob(jobs[2]?.id ?? "missing")).toBeDefined();
  });

  it("reads queue health through fail-fast Redis connections", async () => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl === undefined) throw new Error("REDIS_URL is required for integration tests");
    const healthQueues = createQueues(redisUrl, {
      commandTimeout: 2_500,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    try {
      const health = await queryQueueHealth(healthQueues);
      expect(health).toHaveLength(7);
      expect(health.map(({ name }) => name)).toEqual([
        "Trace ingestion",
        "Evaluations",
        "Trace materialization",
        "Maintenance",
        "Cost recalculation",
        "Alerts",
        "Alert dispatch",
      ]);
    } finally {
      await healthQueues.close();
    }
  });
});

function normalizedSpan(): NormalizedSpan {
  return {
    projectId: "00000000-0000-4000-8000-000000000001",
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    parentSpanId: null,
    traceState: "",
    name: "integration span",
    kind: 1,
    observationKind: "span",
    status: "ok",
    statusMessage: "",
    startTimeUnixNano: "1",
    endTimeUnixNano: "2",
    durationNano: "1",
    serviceName: "test",
    scopeName: "test",
    scopeVersion: "1",
    resourceAttributes: {},
    spanAttributes: {},
    events: [],
    links: [],
    traceName: null,
    userId: null,
    sessionId: null,
    tags: [],
    version: null,
    environment: "test",
    release: null,
    serviceVersion: null,
    model: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: null,
    outputCost: null,
    totalCost: null,
    input: null,
    output: null,
    expiresAt: null,
    ingestedAt: "2026-08-07T00:00:00.000Z",
    ingestVersion: "1",
  };
}
