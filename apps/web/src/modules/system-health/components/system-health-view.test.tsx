// @vitest-environment happy-dom

import type { SystemHealth } from "@lens/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemHealthState } from "../hooks/use-system-health";
import { SystemHealthView } from "./system-health-view";

afterEach(cleanup);

describe("System Health", () => {
  it("shows machine capacity, dependencies, and queues", () => {
    render(<SystemHealthView state={state(health)} />);

    expect(screen.getByText("All monitored systems are operating normally.")).toBeTruthy();
    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.getByText("RAM")).toBeTruthy();
    expect(screen.getByText("Disk")).toBeTruthy();
    expect(screen.getByText("PostgreSQL")).toBeTruthy();
    expect(screen.getByText("ClickHouse")).toBeTruthy();
    expect(screen.getByText("Trace ingestion")).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("does not expose infrastructure data to members", () => {
    render(<SystemHealthView state={state(undefined, false)} />);
    expect(screen.getByText("Owner or admin access is required.")).toBeTruthy();
    expect(screen.queryByText("PostgreSQL")).toBeNull();
  });
});

function state(value: SystemHealth | undefined, canManage = true): SystemHealthState {
  return {
    canManage,
    value,
    health: {
      data: value,
      error: null,
      isError: false,
      isFetching: false,
      isLoading: value === undefined,
      refetch: vi.fn(),
    },
  } as unknown as SystemHealthState;
}

const health: SystemHealth = {
  sampledAt: "2026-08-17T00:00:00.000Z",
  overall: "healthy",
  machine: {
    status: "healthy",
    message: null,
    snapshot: {
      version: 1,
      sampledAt: "2026-08-17T00:00:00.000Z",
      uptimeSeconds: 3600,
      cpu: { usagePercent: 25, logicalCores: 4, load1: 0.5 },
      memory: { totalBytes: 1000, usedBytes: 500, availableBytes: 500, usagePercent: 50 },
      swap: { totalBytes: 0, usedBytes: 0, availableBytes: 0, usagePercent: 0 },
      disk: {
        path: "/",
        totalBytes: 10_000,
        usedBytes: 6_000,
        availableBytes: 4_000,
        usagePercent: 60,
      },
    },
  },
  services: {
    api: { status: "healthy", latencyMs: 0, message: null },
    postgres: {
      status: "healthy",
      latencyMs: 2,
      message: null,
      databaseBytes: 100,
    },
    clickhouse: {
      status: "healthy",
      latencyMs: 3,
      message: null,
      databaseBytes: 200,
      disks: [
        {
          name: "default",
          path: "/clickhouse",
          totalBytes: 1000,
          usedBytes: 500,
          availableBytes: 500,
          usagePercent: 50,
        },
      ],
    },
    redis: {
      status: "healthy",
      latencyMs: 1,
      message: null,
      usedMemoryBytes: 300,
      maxMemoryBytes: null,
    },
    worker: {
      status: "healthy",
      message: null,
      activeInstances: 1,
      lastHeartbeatAt: "2026-08-17T00:00:00.000Z",
    },
  },
  queueStatus: { status: "healthy", message: null },
  queues: [{ name: "Trace ingestion", waiting: 0, active: 1, delayed: 0, failed: 0 }],
};
