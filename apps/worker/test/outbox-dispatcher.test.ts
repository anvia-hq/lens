import type { JobOutboxRow, PostgresConnection } from "@lens/db";
import type { LensQueues } from "@lens/queue";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  claimJobOutbox: vi.fn(),
  completeJobOutbox: vi.fn(),
  retryJobOutbox: vi.fn(),
}));

vi.mock("@lens/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lens/db")>()),
  ...dbMocks,
}));

import {
  createJobOutboxDispatcher,
  dispatchJobOutboxBatch,
  retryDelayMs,
} from "../src/outbox-dispatcher.js";

describe("job outbox dispatcher", () => {
  const maintenanceAdd = vi.fn();
  const costsAdd = vi.fn();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
  const deps = {
    postgres: { db: {} } as PostgresConnection,
    queues: {
      maintenance: { add: maintenanceAdd },
      costs: { add: costsAdd },
    } as unknown as LensQueues,
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes and completes a claimed event with a deterministic job ID", async () => {
    dbMocks.claimJobOutbox.mockResolvedValue([row()]);
    maintenanceAdd.mockResolvedValue({ id: "job" });

    expect(await dispatchJobOutboxBatch(deps)).toBe(1);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(maintenanceAdd).toHaveBeenCalledWith(
      "reconcile-retention",
      { projectId: "10000000-0000-4000-8000-000000000001" },
      { jobId: "outbox-20000000-0000-4000-8000-000000000001" },
    );
    expect(dbMocks.completeJobOutbox).toHaveBeenCalledWith(
      deps.postgres.db,
      "20000000-0000-4000-8000-000000000001",
    );
  });

  it("defers failed publication with capped exponential backoff", async () => {
    const event = row({ attempts: 3 });
    dbMocks.claimJobOutbox.mockResolvedValue([event]);
    maintenanceAdd.mockRejectedValue(new Error("redis unavailable"));
    const now = new Date("2026-08-08T00:00:00.000Z");

    expect(await dispatchJobOutboxBatch(deps, now)).toBe(1);
    expect(dbMocks.retryJobOutbox).toHaveBeenCalledWith(
      deps.postgres.db,
      event.id,
      expect.any(Error),
      4_000,
      now,
    );
    expect(retryDelayMs(100)).toBe(60_000);
  });

  it.each([
    ["delete-project", "maintenance", maintenanceAdd],
    ["recalculate-model-costs", "costs", costsAdd],
  ] as const)("routes %s through the %s queue", async (name, queue, add) => {
    const payload =
      name === "delete-project"
        ? { projectId: "10000000-0000-4000-8000-000000000001" }
        : { recalculationId: "30000000-0000-4000-8000-000000000001" };
    dbMocks.claimJobOutbox.mockResolvedValue([row({ name, queue, payload })]);
    add.mockResolvedValue({ id: "job" });

    expect(await dispatchJobOutboxBatch(deps)).toBe(1);

    expect(add).toHaveBeenCalledWith(name, payload, {
      jobId: "outbox-20000000-0000-4000-8000-000000000001",
    });
  });

  it("starts immediately, contains polling failures, and closes cleanly", async () => {
    dbMocks.claimJobOutbox.mockRejectedValueOnce(new Error("postgres unavailable"));
    const dispatcher = createJobOutboxDispatcher(deps);

    dispatcher.start();
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        "job outbox dispatch failed",
      );
    });
    await dispatcher.close();
  });

  it("uses one-second backoff for the first attempt", () => {
    expect(retryDelayMs(0)).toBe(1_000);
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
  });
});

function row(overrides: Partial<JobOutboxRow> = {}): JobOutboxRow {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    queue: "maintenance",
    name: "reconcile-retention",
    payload: { projectId: "10000000-0000-4000-8000-000000000001" },
    attempts: 1,
    availableAt: new Date(),
    leaseExpiresAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    ...overrides,
  };
}
