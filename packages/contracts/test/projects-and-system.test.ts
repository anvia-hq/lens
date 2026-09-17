import { describe, expect, it } from "vitest";
import {
  createApiKeySchema,
  createMcpTokenSchema,
  createProjectSchema,
  dataDeletionInputSchema,
  metricsRangeSchema,
  projectSettingsSchema,
  systemMonitorSnapshotSchema,
} from "../src/index.js";

describe("project and deletion contracts", () => {
  it("normalizes project credentials and settings", () => {
    expect(createProjectSchema.parse({ name: "  Support  ", slug: "support-agents" })).toEqual({
      name: "Support",
      slug: "support-agents",
    });
    expect(createApiKeySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createMcpTokenSchema.parse({ name: " Assistant " })).toEqual({
      name: "Assistant",
      allowRawPayloads: false,
      expiresAt: null,
    });
    expect(projectSettingsSchema.safeParse({ retentionDays: 14 }).success).toBe(false);
  });

  it("validates and deduplicates bounded deletion requests", () => {
    expect(
      dataDeletionInputSchema.parse({ entityType: "trace", ids: ["A".repeat(32), "A".repeat(32)] }),
    ).toEqual({ entityType: "trace", ids: ["a".repeat(32)] });
    expect(
      dataDeletionInputSchema.safeParse({
        entityType: "session",
        ids: Array.from({ length: 101 }, (_, index) => `session-${index}`),
      }).success,
    ).toBe(false);
    expect(
      dataDeletionInputSchema.safeParse({ entityType: "trace", ids: ["invalid"] }).success,
    ).toBe(false);
    expect(dataDeletionInputSchema.parse({ entityType: "evaluation_run", ids: ["run-1"] })).toEqual(
      { entityType: "evaluation_run", ids: ["run-1"] },
    );
  });
});

describe("system contracts", () => {
  it("accepts supported metric ranges", () => {
    expect(metricsRangeSchema.safeParse("24h").success).toBe(true);
    expect(metricsRangeSchema.safeParse("90d").success).toBe(false);
  });

  it("requires multi-disk snapshots to include the root disk", () => {
    const root = {
      path: "/",
      totalBytes: 100,
      usedBytes: 50,
      availableBytes: 50,
      usagePercent: 50,
    };
    const snapshot = {
      version: 1,
      sampledAt: "2026-08-17T00:00:00.000Z",
      uptimeSeconds: 100,
      cpu: { usagePercent: 25, logicalCores: 4, load1: 0.5 },
      memory: { totalBytes: 100, usedBytes: 50, availableBytes: 50, usagePercent: 50 },
      swap: { totalBytes: 0, usedBytes: 0, availableBytes: 0, usagePercent: 0 },
      disk: root,
    };
    expect(systemMonitorSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      systemMonitorSnapshotSchema.safeParse({
        ...snapshot,
        disks: [{ ...root, path: "/mnt/docker" }],
      }).success,
    ).toBe(false);
  });
});
