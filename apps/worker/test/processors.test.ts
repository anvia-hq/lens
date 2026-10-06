import type { IngestEvaluationsJob, IngestTraceJob, MaterializeTraceJob } from "@lens/contracts";
import type { LensQueues } from "@lens/queue";
import type { Job } from "bullmq";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbFunctions = vi.hoisted(() => ({
  withActiveProjectWrite: vi.fn(),
  applyModelPrices: vi.fn((spans) => spans),
  deleteProjectTelemetry: vi.fn(),
  deleteTelemetryEntities: vi.fn(),
  insertEvaluationRuns: vi.fn(),
  insertEvaluations: vi.fn(),
  insertSpans: vi.fn(),
  materializeTrace: vi.fn(),
  recalculateModelCosts: vi.fn(),
  reconcileProjectRetention: vi.fn(),
}));

vi.mock("@lens/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lens/db")>()),
  ...dbFunctions,
}));

import {
  createCostsProcessor,
  createEvaluationProcessor,
  createIngestTraceProcessor,
  createMaintenanceProcessor,
  createMaterializeTraceProcessor,
  type ProcessorDependencies,
} from "../src/processors.js";

import { evaluationResult, normalizedSpan } from "./helpers/telemetry.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const recalculationId = "30000000-0000-4000-8000-000000000001";
const deletionRequestId = "40000000-0000-4000-8000-000000000001";

describe("worker processors", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbFunctions.applyModelPrices.mockImplementation((spans) => spans);
    dbFunctions.withActiveProjectWrite.mockImplementation((db, _id, write) =>
      write({ organizationId }, db),
    );
  });

  it("prices, inserts, and schedules each distinct trace in an ingest batch", async () => {
    const { deps, select, materializeAdd, logger } = dependencies();
    deps.materializeDelayMs = 3_000;
    select.mockReturnValueOnce(
      selectQuery([
        {
          model: "gpt-test",
          inputPricePerMillion: "1.5",
          cachedInputPricePerMillion: null,
          outputPricePerMillion: "4",
        },
      ]),
    );
    const spans = [
      normalizedSpan({ model: "gpt-test", observationKind: "generation" }),
      normalizedSpan({ spanId: "c".repeat(16), model: "gpt-test", observationKind: "generation" }),
      normalizedSpan({ traceId: "b".repeat(32) }),
    ];
    const process = createIngestTraceProcessor(deps);

    await process(
      job(
        {
          projectId,
          ingestId: "ingest-1",
          receivedAt: "2026-09-17T00:00:00.000Z",
          spans,
        },
        { id: "ingest-1" },
      ),
    );

    expect(dbFunctions.applyModelPrices).toHaveBeenCalledWith(spans, [
      {
        model: "gpt-test",
        inputPricePerMillion: 1.5,
        cachedInputPricePerMillion: null,
        outputPricePerMillion: 4,
      },
    ]);
    expect(dbFunctions.insertSpans).toHaveBeenCalledWith(deps.clickhouse, spans);
    expect(materializeAdd).toHaveBeenCalledTimes(2);
    expect(materializeAdd).toHaveBeenNthCalledWith(
      1,
      "materialize",
      { projectId, traceId: "a".repeat(32) },
      {
        delay: 3_000,
        jobId: `materialize-${projectId}-${"a".repeat(32)}`,
        removeOnComplete: true,
      },
    );
    expect(logger.info).toHaveBeenCalledWith(
      { jobId: "ingest-1", spans: 3 },
      "ingested trace batch",
    );
  });

  it("skips all writes and materialization scheduling when the project is inactive", async () => {
    const { deps, select } = dependencies();
    dbFunctions.withActiveProjectWrite.mockResolvedValueOnce(undefined);

    await createIngestTraceProcessor(deps)(
      job({
        projectId,
        ingestId: "ingest-1",
        receivedAt: "2026-09-17T00:00:00.000Z",
        spans: [normalizedSpan({ model: "gpt-test", observationKind: "embedding" })],
      } as unknown as IngestTraceJob),
    );

    expect(select).not.toHaveBeenCalled();
    expect(dbFunctions.insertSpans).not.toHaveBeenCalled();
    expect(deps.queues.materialize.add).not.toHaveBeenCalled();
  });

  it("materializes traces and ingests evaluation batches", async () => {
    const { deps, logger } = dependencies();
    await createMaterializeTraceProcessor(deps)(
      job({ projectId, traceId: "a".repeat(32) } as MaterializeTraceJob),
    );
    const evaluation = evaluationResult();
    await createEvaluationProcessor(deps)(
      job(
        {
          projectId,
          ingestId: "evaluation-ingest-1",
          receivedAt: "2026-09-17T00:00:00.000Z",
          evaluations: [evaluation],
          runs: undefined,
        } as IngestEvaluationsJob,
        { id: "evaluation-1" },
      ),
    );

    expect(dbFunctions.materializeTrace).toHaveBeenCalledWith(
      deps.clickhouse,
      projectId,
      "a".repeat(32),
    );
    expect(dbFunctions.insertEvaluations).toHaveBeenCalledWith(deps.clickhouse, [evaluation]);
    expect(dbFunctions.insertEvaluationRuns).toHaveBeenCalledWith(deps.clickhouse, []);
    expect(logger.info).toHaveBeenCalledWith(
      { jobId: "evaluation-1", evaluations: 1, runs: 0 },
      "ingested evaluation batch",
    );
  });

  it.each([
    ["30", 30],
    ["unlimited", null],
  ])("reconciles the current retention value %s", async (retentionDays, expected) => {
    const { deps, select } = dependencies();
    select.mockReturnValueOnce(selectQuery([{ retentionDays }], true));

    await createMaintenanceProcessor(deps)(job({ projectId }, { name: "reconcile-retention" }));

    expect(dbFunctions.reconcileProjectRetention).toHaveBeenCalledWith(
      deps.clickhouse,
      projectId,
      expected,
    );
  });

  it("treats missing projects as an idempotent retention success", async () => {
    const { deps, select } = dependencies();
    select.mockReturnValueOnce(selectQuery([], true));

    await createMaintenanceProcessor(deps)(job({ projectId }, { name: "reconcile-retention" }));

    expect(dbFunctions.reconcileProjectRetention).not.toHaveBeenCalled();
  });

  it("deletes project telemetry before its tombstoned database row", async () => {
    const { deps, deleteWhere, select } = dependencies();
    select.mockReturnValueOnce(selectQuery([{ state: "deleting" }], true));

    await createMaintenanceProcessor(deps)(job({ projectId }, { name: "delete-project" }));

    expect(dbFunctions.deleteProjectTelemetry).toHaveBeenCalledWith(deps.clickhouse, projectId);
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it("does not delete an active or missing project for a stale maintenance job", async () => {
    const { deps, select, deleteWhere } = dependencies();
    select.mockReturnValueOnce(selectQuery([], true));
    await createMaintenanceProcessor(deps)(job({ projectId }, { name: "delete-project" }));
    expect(dbFunctions.deleteProjectTelemetry).not.toHaveBeenCalled();
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("preserves the project tombstone if telemetry cleanup fails", async () => {
    const { deps, select, deleteWhere } = dependencies();
    select.mockReturnValueOnce(selectQuery([{ state: "deleting" }], true));
    dbFunctions.deleteProjectTelemetry.mockRejectedValueOnce(new Error("mutation failed"));
    await expect(
      createMaintenanceProcessor(deps)(job({ projectId }, { name: "delete-project" })),
    ).rejects.toThrow("mutation failed");
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it("skips evaluation and materialization writes for inactive projects", async () => {
    const { deps } = dependencies();
    dbFunctions.withActiveProjectWrite.mockResolvedValue(undefined);
    await createMaterializeTraceProcessor(deps)(job({ projectId, traceId: "a".repeat(32) }));
    await createEvaluationProcessor(deps)(
      job({
        projectId,
        ingestId: "old",
        receivedAt: "2026-09-17T00:00:00.000Z",
        evaluations: [evaluationResult()],
        runs: [],
      }),
    );
    expect(dbFunctions.materializeTrace).not.toHaveBeenCalled();
    expect(dbFunctions.insertEvaluations).not.toHaveBeenCalled();
    expect(dbFunctions.insertEvaluationRuns).not.toHaveBeenCalled();
  });

  it("does not launch another evaluation write after an insert fails", async () => {
    const { deps } = dependencies();
    dbFunctions.insertEvaluations.mockRejectedValueOnce(new Error("insert failed"));
    await expect(
      createEvaluationProcessor(deps)(
        job({
          projectId,
          ingestId: "old",
          receivedAt: "2026-09-17T00:00:00.000Z",
          evaluations: [evaluationResult()],
          runs: [],
        }),
      ),
    ).rejects.toThrow("insert failed");
    expect(dbFunctions.insertEvaluationRuns).not.toHaveBeenCalled();
  });

  it("tracks a data deletion request through completion", async () => {
    const { deps, select, updates } = dependencies();
    select.mockReturnValueOnce(
      selectQuery(
        [
          {
            id: deletionRequestId,
            projectId,
            entityType: "trace",
            entityIds: ["a".repeat(32)],
            status: "queued",
            startedAt: null,
          },
        ],
        true,
      ),
    );

    await createMaintenanceProcessor(deps)(
      job({ requestId: deletionRequestId }, { name: "delete-data" }),
    );

    expect(dbFunctions.deleteTelemetryEntities).toHaveBeenCalledWith(
      deps.clickhouse,
      projectId,
      "trace",
      ["a".repeat(32)],
    );
    expect(updates[0]).toMatchObject({ status: "running", error: null });
    expect(updates[1]).toMatchObject({ status: "completed", error: null });
  });

  it("treats missing and completed data deletion requests as idempotent successes", async () => {
    const missing = dependencies();
    missing.select.mockReturnValueOnce(selectQuery([], true));
    await createMaintenanceProcessor(missing.deps)(
      job({ requestId: deletionRequestId }, { name: "delete-data" }),
    );

    const completed = dependencies();
    completed.select.mockReturnValueOnce(
      selectQuery([{ id: deletionRequestId, status: "completed" }], true),
    );
    await createMaintenanceProcessor(completed.deps)(
      job({ requestId: deletionRequestId }, { name: "delete-data" }),
    );

    expect(missing.update).not.toHaveBeenCalled();
    expect(completed.update).not.toHaveBeenCalled();
    expect(dbFunctions.deleteTelemetryEntities).not.toHaveBeenCalled();
  });

  it.each([
    {
      attemptsMade: 1,
      opts: { attempts: 3 },
      failure: new Error("clickhouse unavailable"),
      status: "queued",
      message: "clickhouse unavailable",
    },
    {
      attemptsMade: 0,
      opts: {},
      failure: "clickhouse unavailable",
      status: "failed",
      message: "Unknown error",
    },
  ])(
    "records data deletion retry and terminal failures",
    async ({ attemptsMade, opts, failure, status, message }) => {
      const { deps, select, updates } = dependencies();
      const startedAt = new Date("2026-08-01T00:00:00.000Z");
      select.mockReturnValueOnce(
        selectQuery(
          [
            {
              id: deletionRequestId,
              projectId,
              entityType: "session",
              entityIds: ["session-1"],
              status: "queued",
              startedAt,
            },
          ],
          true,
        ),
      );
      dbFunctions.deleteTelemetryEntities.mockRejectedValue(failure);

      await expect(
        createMaintenanceProcessor(deps)(
          job({ requestId: deletionRequestId }, { name: "delete-data", attemptsMade, opts }),
        ),
      ).rejects.toBe(failure);

      expect(updates[0]).toMatchObject({ status: "running", startedAt });
      expect(updates[1]).toMatchObject({ status, error: message });
      expect(updates[1]?.completedAt === null).toBe(status === "queued");
    },
  );

  it("rejects unknown maintenance and cost jobs", async () => {
    const { deps } = dependencies();
    await expect(createMaintenanceProcessor(deps)(job({}, { name: "unexpected" }))).rejects.toThrow(
      "Unsupported maintenance job: unexpected",
    );
    await expect(createCostsProcessor(deps)(job({}, { name: "unexpected" }))).rejects.toThrow(
      "Unsupported cost job: unexpected",
    );
  });

  it("ignores missing and already completed cost recalculations", async () => {
    const missing = dependencies();
    missing.select.mockReturnValueOnce(selectQuery([], true));
    await createCostsProcessor(missing.deps)(
      job({ recalculationId }, { name: "recalculate-model-costs" }),
    );

    const completed = dependencies();
    completed.select.mockReturnValueOnce(selectQuery([{ status: "completed" }], true));
    await createCostsProcessor(completed.deps)(
      job({ recalculationId }, { name: "recalculate-model-costs" }),
    );

    expect(missing.update).not.toHaveBeenCalled();
    expect(completed.update).not.toHaveBeenCalled();
  });

  it("completes a model-cost recalculation with affected counts", async () => {
    const { deps, select, updates, logger } = dependencies();
    const run = recalculationRun();
    select
      .mockReturnValueOnce(selectQuery([run], true))
      .mockReturnValueOnce(selectQuery([{ id: projectId }]));
    dbFunctions.recalculateModelCosts.mockResolvedValue({ affectedSpans: 4, affectedTraces: 2 });

    await createCostsProcessor(deps)(
      job({ recalculationId }, { id: "cost-1", name: "recalculate-model-costs" }),
    );

    expect(dbFunctions.recalculateModelCosts).toHaveBeenCalledWith(deps.clickhouse, {
      projectIds: [projectId],
      prices: run.priceSnapshot,
      from: "2026-08-01T00:00:00.000Z",
      to: null,
    });
    expect(updates.map((value) => value.status)).toEqual(["running", "completed"]);
    expect(logger.info).toHaveBeenCalledWith(
      { jobId: "cost-1", affectedSpans: 4, affectedTraces: 2 },
      "recalculated model costs",
    );
  });

  it("skips deleting projects during cost recalculation", async () => {
    const { deps, select, updates } = dependencies();
    select
      .mockReturnValueOnce(selectQuery([recalculationRun()], true))
      .mockReturnValueOnce(selectQuery([{ id: projectId }]));
    dbFunctions.withActiveProjectWrite.mockResolvedValueOnce(undefined);
    await createCostsProcessor(deps)(job({ recalculationId }, { name: "recalculate-model-costs" }));
    expect(dbFunctions.recalculateModelCosts).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({
      status: "completed",
      affectedSpans: "0",
      affectedTraces: "0",
    });
  });

  it.each([
    [1, 3, "queued"],
    [2, 3, "failed"],
  ])("records cost failures for attempt %i of %i", async (attemptsMade, attempts, status) => {
    const { deps, select, updates } = dependencies();
    select
      .mockReturnValueOnce(selectQuery([recalculationRun()], true))
      .mockReturnValueOnce(selectQuery([{ id: projectId }]));
    dbFunctions.recalculateModelCosts.mockRejectedValue(new Error("clickhouse unavailable"));

    await expect(
      createCostsProcessor(deps)(
        job(
          { recalculationId },
          { name: "recalculate-model-costs", attemptsMade, opts: { attempts } },
        ),
      ),
    ).rejects.toThrow("clickhouse unavailable");

    expect(updates.at(-1)).toMatchObject({ status, error: "clickhouse unavailable" });
    expect(updates.at(-1)?.completedAt === null).toBe(status === "queued");
  });
});

function dependencies() {
  const select = vi.fn();
  const updates: Array<Record<string, unknown>> = [];
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return { where: updateWhere };
    }),
  }));
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const materializeAdd = vi.fn().mockResolvedValue({ id: "materialize" });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  const deps = {
    clickhouse: {} as ProcessorDependencies["clickhouse"],
    postgres: {
      db: {
        select,
        update,
        delete: vi.fn(() => ({ where: deleteWhere })),
      },
    } as unknown as ProcessorDependencies["postgres"],
    queues: { materialize: { add: materializeAdd } } as unknown as LensQueues,
    logger,
    materializeDelayMs: 1_500,
    appUrl: "http://localhost:3000",
  };
  deps.postgres.db.transaction = vi.fn(async (callback) => callback(deps.postgres.db as never));
  return { deps, deleteWhere, logger, materializeAdd, select, update, updates };
}

function selectQuery(rows: unknown[], withLimit = false) {
  const result = withLimit
    ? { limit: vi.fn().mockResolvedValue(rows), for: vi.fn().mockResolvedValue(rows) }
    : Promise.resolve(rows);
  return { from: vi.fn(() => ({ where: vi.fn(() => result) })) };
}

function job<T>(data: T, overrides: Partial<Job<T>> & { name?: string } = {}): Job<T> {
  return {
    id: "job-1",
    name: "job",
    data,
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as Job<T>;
}

function recalculationRun() {
  return {
    id: recalculationId,
    status: "queued",
    organizationId,
    priceSnapshot: [{ model: "gpt-test" }],
    from: new Date("2026-08-01T00:00:00.000Z"),
    to: null,
  };
}
