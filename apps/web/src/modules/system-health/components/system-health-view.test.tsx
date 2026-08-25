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
    expect(screen.getByText("Root disk")).toBeTruthy();
    expect(screen.getByText("Docker data")).toBeTruthy();
    expect(screen.getByText("/mnt/docker", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Healthy")[0]?.className).toContain(
      "bg-status-success-fill-foreground",
    );
    expect(document.querySelectorAll(".size-1\\.5.rounded-full")).toHaveLength(0);
    expect(screen.getByText("PostgreSQL")).toBeTruthy();
    expect(screen.getByText("ClickHouse")).toBeTruthy();
    expect(screen.getByText("Trace ingestion")).toBeTruthy();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
  });

  it("arranges five machine cards as three then two", () => {
    render(<SystemHealthView state={state(singleDiskHealth)} />);
    const cells = [...document.querySelectorAll(".lg\\:grid-cols-6 > div")];
    expect(cells).toHaveLength(5);
    expect(cells.slice(0, 3).every((cell) => cell.className.includes("lg:col-span-2"))).toBe(true);
    expect(cells.slice(3).every((cell) => cell.className.includes("lg:col-span-3"))).toBe(true);
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
        name: "Root disk",
        path: "/",
        totalBytes: 10_000,
        usedBytes: 6_000,
        availableBytes: 4_000,
        usagePercent: 60,
      },
      disks: [
        {
          name: "Root disk",
          path: "/",
          totalBytes: 10_000,
          usedBytes: 6_000,
          availableBytes: 4_000,
          usagePercent: 60,
        },
        {
          name: "Docker data",
          path: "/mnt/docker",
          totalBytes: 100_000,
          usedBytes: 20_000,
          availableBytes: 80_000,
          usagePercent: 20,
        },
      ],
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

const singleDiskHealth: SystemHealth = {
  ...health,
  machine: {
    ...health.machine,
    snapshot: health.machine.snapshot
      ? {
          ...health.machine.snapshot,
          disks: health.machine.snapshot.disks?.slice(0, 1),
        }
      : null,
  },
};
