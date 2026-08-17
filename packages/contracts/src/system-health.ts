import { z } from "zod";

export const systemHealthStatusSchema = z.enum([
  "healthy",
  "warning",
  "critical",
  "unavailable",
  "not_configured",
]);

export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>;
export type SystemHealthOverallStatus = Extract<
  SystemHealthStatus,
  "healthy" | "warning" | "critical"
>;

const capacitySchema = z.object({
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  availableBytes: z.number().nonnegative(),
  usagePercent: z.number().min(0).max(100),
});

const monitorDiskSchema = capacitySchema.extend({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
});

export type SystemCapacity = z.infer<typeof capacitySchema>;

export const systemMonitorSnapshotSchema = z.object({
  version: z.literal(1),
  sampledAt: z.iso.datetime(),
  uptimeSeconds: z.number().nonnegative(),
  cpu: z.object({
    usagePercent: z.number().min(0).max(100).nullable(),
    logicalCores: z.number().int().positive(),
    load1: z.number().nonnegative(),
  }),
  memory: capacitySchema,
  swap: capacitySchema,
  // `disk` is retained for compatibility with monitor/API versions that only
  // reported the host root filesystem. New collectors also return every
  // configured filesystem in `disks`.
  disk: monitorDiskSchema,
  disks: z.array(monitorDiskSchema).min(1).optional(),
});

export type SystemMonitorSnapshot = z.infer<typeof systemMonitorSnapshotSchema>;

export type SystemServiceStatus = {
  status: SystemHealthStatus;
  latencyMs: number | null;
  message: string | null;
};

export type SystemQueueHealth = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export type SystemHealth = {
  sampledAt: string;
  overall: SystemHealthOverallStatus;
  machine: {
    status: SystemHealthStatus;
    message: string | null;
    snapshot: SystemMonitorSnapshot | null;
  };
  services: {
    api: SystemServiceStatus;
    postgres: SystemServiceStatus & { databaseBytes: number | null };
    clickhouse: SystemServiceStatus & {
      databaseBytes: number | null;
      disks: Array<SystemCapacity & { name: string; path: string }>;
    };
    redis: SystemServiceStatus & {
      usedMemoryBytes: number | null;
      maxMemoryBytes: number | null;
    };
    worker: Omit<SystemServiceStatus, "latencyMs"> & {
      activeInstances: number;
      lastHeartbeatAt: string | null;
    };
  };
  queueStatus: Pick<SystemServiceStatus, "status" | "message">;
  queues: SystemQueueHealth[];
};
