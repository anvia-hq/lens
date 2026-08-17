import { readFile, statfs } from "node:fs/promises";
import type { SystemCapacity, SystemMonitorSnapshot } from "@lens/contracts";

type CpuSample = { idle: number; total: number; logicalCores: number };

export type HostPaths = {
  proc: string;
  root: string;
};

export class HostCollector {
  private previousCpu: CpuSample | undefined;

  constructor(private readonly paths: HostPaths) {}

  async snapshot(): Promise<SystemMonitorSnapshot> {
    const [stat, meminfo, uptime, loadavg, disk] = await Promise.all([
      readFile(`${this.paths.proc}/stat`, "utf8"),
      readFile(`${this.paths.proc}/meminfo`, "utf8"),
      readFile(`${this.paths.proc}/uptime`, "utf8"),
      readFile(`${this.paths.proc}/loadavg`, "utf8"),
      statfs(this.paths.root),
    ]);
    const cpu = parseCpuStat(stat);
    const usagePercent = cpuUsagePercent(this.previousCpu, cpu);
    this.previousCpu = cpu;
    const memory = parseMeminfo(meminfo);
    const totalDiskBytes = disk.blocks * disk.bsize;
    const availableDiskBytes = disk.bavail * disk.bsize;

    return {
      version: 1,
      sampledAt: new Date().toISOString(),
      uptimeSeconds: parseNonNegativeNumber(uptime.split(/\s+/)[0]),
      cpu: {
        usagePercent,
        logicalCores: cpu.logicalCores,
        load1: parseNonNegativeNumber(loadavg.split(/\s+/)[0]),
      },
      memory: capacity(memory.total, memory.available),
      swap: capacity(memory.swapTotal, memory.swapFree),
      disk: { path: "/", ...capacity(totalDiskBytes, availableDiskBytes) },
    };
  }
}

export function parseCpuStat(value: string): CpuSample {
  const lines = value.trim().split("\n");
  const aggregate = lines[0]?.trim().split(/\s+/);
  if (aggregate?.[0] !== "cpu") throw new Error("Host CPU statistics are unavailable");
  const values = aggregate.slice(1).map((item) => parseNonNegativeNumber(item));
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  // Linux includes guest and guest_nice in user and nice, so only the first eight
  // counters contribute to the aggregate total.
  const total = values.slice(0, 8).reduce((sum, item) => sum + item, 0);
  const logicalCores = lines.filter((line) => /^cpu\d+\s/.test(line)).length;
  if (logicalCores === 0 || total === 0) throw new Error("Host CPU statistics are invalid");
  return { idle, total, logicalCores };
}

export function cpuUsagePercent(
  previous: CpuSample | undefined,
  current: CpuSample,
): number | null {
  if (previous === undefined) return null;
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0) return null;
  return roundPercent(((totalDelta - idleDelta) / totalDelta) * 100);
}

export function parseMeminfo(value: string) {
  const entries = new Map<string, number>();
  for (const line of value.split("\n")) {
    const match = /^([^:]+):\s+(\d+)\s+kB$/.exec(line.trim());
    if (match?.[1] && match[2]) entries.set(match[1], Number(match[2]) * 1024);
  }
  const total = entries.get("MemTotal") ?? 0;
  const available =
    entries.get("MemAvailable") ??
    (entries.get("MemFree") ?? 0) + (entries.get("Buffers") ?? 0) + (entries.get("Cached") ?? 0);
  if (total <= 0) throw new Error("Host memory statistics are unavailable");
  return {
    total,
    available,
    swapTotal: entries.get("SwapTotal") ?? 0,
    swapFree: entries.get("SwapFree") ?? 0,
  };
}

export function capacity(totalBytes: number, availableBytes: number): SystemCapacity {
  const total = Math.max(0, totalBytes);
  const available = Math.min(total, Math.max(0, availableBytes));
  const used = total - available;
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usagePercent: total === 0 ? 0 : roundPercent((used / total) * 100),
  };
}

function parseNonNegativeNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}
