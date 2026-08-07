import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQueues, type LensQueues, materializeJobId, queueNames } from "../../src/index.js";

describe("queue integration", () => {
  let queues: LensQueues;

  beforeAll(() => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl === undefined) throw new Error("REDIS_URL is required for integration tests");
    queues = createQueues(redisUrl);
  });

  afterAll(async () => {
    await Promise.all(
      [queues.ingest, queues.evaluations, queues.materialize, queues.maintenance, queues.costs].map(
        (queue) => queue.obliterate({ force: true }),
      ),
    );
    await queues.close();
  });

  it("persists jobs on every typed queue with production defaults", async () => {
    const jobs = await Promise.all([
      queues.ingest.add("ingest", {
        projectId: "00000000-0000-4000-8000-000000000001",
        ingestId: "ingest-1",
        receivedAt: "2026-08-07T00:00:00.000Z",
        spans: [],
      }),
      queues.evaluations.add("evaluations", {
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
      queues.maintenance.add("retention", {
        projectId: "00000000-0000-4000-8000-000000000001",
        retentionDays: 30,
      }),
      queues.costs.add("costs", { recalculationId: "recalculation-1" }),
    ]);

    expect(jobs.map((job) => job.queueName)).toEqual(Object.values(queueNames));
    for (const job of jobs) {
      expect(job.opts).toMatchObject({
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 10_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      });
    }
    expect(await queues.materialize.getJob(jobs[2]?.id ?? "missing")).toBeDefined();
  });
});
