import type { SystemMonitorSnapshot } from "@lens/contracts";
import { queryClickHouseCapacity, queryPostgresDatabaseBytes } from "@lens/db";
import { listWorkerHeartbeats, queryQueueHealth } from "@lens/queue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectSystemHealth,
  cpuStatus,
  fetchMonitorSnapshot,
  memoryStatus,
} from "../src/modules/system/health.js";
import type { ApiDependencies } from "../src/utils/types.js";

vi.mock("@lens/db", () => ({
  queryClickHouseCapacity: vi.fn(),
  queryPostgresDatabaseBytes: vi.fn(),
}));

vi.mock("@lens/queue", () => ({
  listWorkerHeartbeats: vi.fn(),
  queryQueueHealth: vi.fn(),
}));

const monitorSnapshot: SystemMonitorSnapshot = {
  version: 1,
  sampledAt: "2026-08-17T00:00:00.000Z",
  uptimeSeconds: 3600,
  cpu: { usagePercent: 20, logicalCores: 4, load1: 0.5 },
  memory: { totalBytes: 1000, usedBytes: 500, availableBytes: 500, usagePercent: 50 },
  swap: { totalBytes: 0, usedBytes: 0, availableBytes: 0, usagePercent: 0 },
  disk: { path: "/", totalBytes: 1000, usedBytes: 600, availableBytes: 400, usagePercent: 60 },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(queryPostgresDatabaseBytes).mockResolvedValue(100);
  vi.mocked(queryClickHouseCapacity).mockResolvedValue({
    databaseBytes: 200,
    disks: [{ name: "default", path: "/clickhouse", totalBytes: 1000, availableBytes: 400 }],
  });
  vi.mocked(listWorkerHeartbeats).mockResolvedValue(["2026-08-17T00:00:00.000Z"]);
  vi.mocked(queryQueueHealth).mockResolvedValue([
    { name: "Trace ingestion", waiting: 1, active: 1, delayed: 0, failed: 0 },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(monitorSnapshot) }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("system health aggregation", () => {
  it("returns a complete healthy snapshot", async () => {
    await expect(fetchMonitorSnapshot("http://monitor:3100")).resolves.toEqual(monitorSnapshot);
    const health = await collectSystemHealth(dependencies());

    expect(health.machine.status).toBe("healthy");
    expect(health.services.postgres.status).toBe("healthy");
    expect(health.services.clickhouse.status).toBe("healthy");
    expect(health.services.redis.status).toBe("healthy");
    expect(health.services.worker.status).toBe("healthy");
    expect(health.queueStatus.status).toBe("healthy");
    expect(health.overall).toBe("healthy");
    expect(health.machine.snapshot).toEqual(monitorSnapshot);
    expect(health.services.postgres.databaseBytes).toBe(100);
    expect(health.services.clickhouse.disks[0]?.usagePercent).toBe(60);
    expect(health.services.redis.usedMemoryBytes).toBe(500);
    expect(health.services.worker.activeInstances).toBe(1);
    expect(health.queues[0]?.waiting).toBe(1);
  });

  it("keeps partial results and marks required failures critical", async () => {
    vi.mocked(queryPostgresDatabaseBytes).mockRejectedValueOnce(new Error("down"));
    vi.mocked(listWorkerHeartbeats).mockResolvedValueOnce([]);
    const health = await collectSystemHealth(dependencies({ monitorUrl: undefined }));

    expect(health.overall).toBe("critical");
    expect(health.machine.status).toBe("not_configured");
    expect(health.services.postgres).toMatchObject({
      status: "critical",
      message: "PostgreSQL is unavailable",
      databaseBytes: null,
    });
    expect(health.services.worker).toMatchObject({
      status: "critical",
      activeInstances: 0,
      message: "No active worker heartbeat",
    });
    expect(health.services.clickhouse.status).toBe("healthy");
  });

  it("applies resource warning and critical thresholds", () => {
    expect(cpuStatus(84.9)).toBe("healthy");
    expect(cpuStatus(85)).toBe("warning");
    expect(cpuStatus(95)).toBe("critical");
    expect(memoryStatus(80)).toBe("warning");
    expect(memoryStatus(90)).toBe("critical");
  });

  it("aborts a database probe when its deadline expires", async () => {
    vi.useFakeTimers();
    let probeSignal: AbortSignal | undefined;
    vi.mocked(queryPostgresDatabaseBytes).mockImplementationOnce((_sql, signal) => {
      probeSignal = signal;
      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });

    const collecting = collectSystemHealth(dependencies());
    await vi.advanceTimersByTimeAsync(2_000);
    const health = await collecting;

    expect(probeSignal?.aborted).toBe(true);
    expect(health.services.postgres.status).toBe("critical");
  });
});

function dependencies(options: { monitorUrl?: string } = { monitorUrl: "http://monitor:3100" }) {
  return {
    config: {
      SYSTEM_MONITOR_URL: options.monitorUrl,
      CLICKHOUSE_DATABASE: "lens",
    },
    postgres: { sql: vi.fn() },
    clickhouse: {},
    systemHealthRedis: {
      ping: vi.fn().mockResolvedValue("PONG"),
      info: vi.fn().mockResolvedValue("used_memory:500\nmaxmemory:1000\n"),
    },
    systemHealthQueues: {},
  } as unknown as ApiDependencies;
}
