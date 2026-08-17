import type {
  SystemCapacity,
  SystemHealth,
  SystemHealthOverallStatus,
  SystemHealthStatus,
  SystemMonitorSnapshot,
} from "@lens/contracts";
import { systemMonitorSnapshotSchema } from "@lens/contracts";
import { queryClickHouseCapacity, queryPostgresDatabaseBytes } from "@lens/db";
import { listWorkerHeartbeats, queryQueueHealth } from "@lens/queue";
import type { ApiDependencies } from "../../utils/types.js";

const PROBE_TIMEOUT_MS = 2_000;

export async function collectSystemHealth(deps: ApiDependencies): Promise<SystemHealth> {
  const [monitor, postgres, clickhouse, redis, workers, queues] = await Promise.all([
    probeMonitor(deps.config.SYSTEM_MONITOR_URL),
    probe("PostgreSQL is unavailable", (signal) =>
      queryPostgresDatabaseBytes(deps.postgres.sql, signal),
    ),
    probe("ClickHouse is unavailable", (signal) =>
      queryClickHouseCapacity(deps.clickhouse, deps.config.CLICKHOUSE_DATABASE, signal),
    ),
    probe("Redis is unavailable", async () => {
      const [pong, info] = await Promise.all([
        deps.systemHealthRedis.ping(),
        deps.systemHealthRedis.info("memory"),
      ]);
      if (pong !== "PONG") throw new Error("Unexpected Redis response");
      const memory = parseRedisMemory(info);
      return memory;
    }),
    probe("Worker heartbeat is unavailable", () => listWorkerHeartbeats(deps.systemHealthRedis)),
    probe("Queue metrics are unavailable", () => queryQueueHealth(deps.systemHealthQueues)),
  ]);

  const machine = machineHealth(monitor, deps.config.SYSTEM_MONITOR_URL !== undefined);
  const postgresStatus = postgres.ok ? "healthy" : "critical";
  const clickhouseDisks = clickhouse.ok
    ? clickhouse.value.disks.map((disk) => ({
        name: disk.name,
        path: disk.path,
        ...capacity(disk.totalBytes, disk.availableBytes),
      }))
    : [];
  const clickhouseStatus = clickhouse.ok
    ? highestStatus(clickhouseDisks.map((disk) => capacityStatus(disk.usagePercent)))
    : "critical";
  const redisCapacity =
    redis.ok && redis.value.maxMemoryBytes > 0
      ? capacity(
          redis.value.maxMemoryBytes,
          redis.value.maxMemoryBytes - redis.value.usedMemoryBytes,
        )
      : null;
  const redisStatus = redis.ok
    ? redisCapacity === null
      ? "healthy"
      : capacityStatus(redisCapacity.usagePercent)
    : "critical";
  const workerStatus = workers.ok && workers.value.length > 0 ? "healthy" : "critical";
  const queueStatus = queues.ok ? "healthy" : "unavailable";
  const overall = overallStatus([
    machine.status,
    postgresStatus,
    clickhouseStatus,
    redisStatus,
    workerStatus,
    queueStatus,
  ]);

  return {
    sampledAt: new Date().toISOString(),
    overall,
    machine,
    services: {
      api: { status: "healthy", latencyMs: 0, message: null },
      postgres: {
        status: postgresStatus,
        latencyMs: postgres.latencyMs,
        message: postgres.ok ? null : postgres.message,
        databaseBytes: postgres.ok ? postgres.value : null,
      },
      clickhouse: {
        status: clickhouseStatus,
        latencyMs: clickhouse.latencyMs,
        message: clickhouse.ok ? null : clickhouse.message,
        databaseBytes: clickhouse.ok ? clickhouse.value.databaseBytes : null,
        disks: clickhouseDisks,
      },
      redis: {
        status: redisStatus,
        latencyMs: redis.latencyMs,
        message: redis.ok ? null : redis.message,
        usedMemoryBytes: redis.ok ? redis.value.usedMemoryBytes : null,
        maxMemoryBytes:
          redis.ok && redis.value.maxMemoryBytes > 0 ? redis.value.maxMemoryBytes : null,
      },
      worker: {
        status: workerStatus,
        message:
          workers.ok && workers.value.length === 0
            ? "No active worker heartbeat"
            : workers.ok
              ? null
              : workers.message,
        activeInstances: workers.ok ? workers.value.length : 0,
        lastHeartbeatAt: workers.ok ? (workers.value[0] ?? null) : null,
      },
    },
    queueStatus: {
      status: queueStatus,
      message: queues.ok ? null : queues.message,
    },
    queues: queues.ok ? queues.value : [],
  };
}

type Probe<T> =
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; message: string; latencyMs: null };

async function probe<T>(
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<Probe<T>> {
  const startedAt = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Probe timed out"));
        }, PROBE_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, value, latencyMs: Math.round((performance.now() - startedAt) * 10) / 10 };
  } catch {
    return { ok: false, message, latencyMs: null };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function probeMonitor(url: string | undefined): Promise<Probe<SystemMonitorSnapshot> | null> {
  if (url === undefined) return null;
  return probe("Machine metrics collector is unavailable", (signal) =>
    fetchMonitorSnapshot(url, signal),
  );
}

export async function fetchMonitorSnapshot(
  url: string,
  signal: AbortSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS),
): Promise<SystemMonitorSnapshot> {
  const endpoint = new URL("snapshot", `${url.replace(/\/$/, "")}/`);
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error("Monitor request failed");
  return systemMonitorSnapshotSchema.parse(await response.json());
}

function machineHealth(
  monitor: Probe<SystemMonitorSnapshot> | null,
  configured: boolean,
): SystemHealth["machine"] {
  if (!configured || monitor === null) {
    return {
      status: "not_configured",
      message: "Machine metrics are not configured",
      snapshot: null,
    };
  }
  if (!monitor.ok) return { status: "unavailable", message: monitor.message, snapshot: null };
  const statuses = [
    monitor.value.cpu.usagePercent === null ? "healthy" : cpuStatus(monitor.value.cpu.usagePercent),
    memoryStatus(monitor.value.memory.usagePercent),
    capacityStatus(monitor.value.disk.usagePercent),
  ];
  return { status: highestStatus(statuses), message: null, snapshot: monitor.value };
}

export function cpuStatus(percent: number): SystemHealthOverallStatus {
  return percent >= 95 ? "critical" : percent >= 85 ? "warning" : "healthy";
}

export function memoryStatus(percent: number): SystemHealthOverallStatus {
  return percent >= 90 ? "critical" : percent >= 80 ? "warning" : "healthy";
}

export function capacityStatus(percent: number): SystemHealthOverallStatus {
  return percent >= 90 ? "critical" : percent >= 80 ? "warning" : "healthy";
}

function overallStatus(statuses: SystemHealthStatus[]): SystemHealthOverallStatus {
  const normalized = statuses
    .filter((status) => status !== "not_configured")
    .map((status) => (status === "unavailable" ? "warning" : status));
  return highestStatus(normalized);
}

function highestStatus(statuses: SystemHealthStatus[]): SystemHealthOverallStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning") || statuses.includes("unavailable")) return "warning";
  return "healthy";
}

function capacity(totalBytes: number, availableBytes: number): SystemCapacity {
  const total = Math.max(0, totalBytes);
  const available = Math.min(total, Math.max(0, availableBytes));
  const used = total - available;
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usagePercent: total === 0 ? 0 : Math.round((used / total) * 1_000) / 10,
  };
}

function parseRedisMemory(value: string) {
  const fields = new Map<string, number>();
  for (const line of value.split("\n")) {
    const [key, raw] = line.trim().split(":");
    if (!key || !raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) fields.set(key, parsed);
  }
  return {
    usedMemoryBytes: Math.max(0, fields.get("used_memory") ?? 0),
    maxMemoryBytes: Math.max(0, fields.get("maxmemory") ?? 0),
  };
}
