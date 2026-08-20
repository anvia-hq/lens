import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDataDeletionsRouter } from "../src/modules/data-deletions/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000001";
const access = vi.hoisted(() => ({ role: "owner" }));

vi.mock("../src/utils/access.js", () => ({
  canManage: (role: string) => role === "owner" || role === "admin",
  requireProjectAccess: vi.fn().mockImplementation(() =>
    Promise.resolve({
      role: access.role,
      project: { id: projectId, state: "active" },
    }),
  ),
}));

beforeEach(() => {
  access.role = "owner";
});

describe("data deletion API", () => {
  it("creates a deletion request and durable outbox event", async () => {
    const inserted: unknown[] = [];
    const row = {
      id: requestId,
      projectId,
      entityType: "trace",
      entityIds: ["a".repeat(32)],
      status: "queued",
      requestedBy: "user-1",
      error: null,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      startedAt: null,
      completedAt: null,
    } as const;
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn((value) => {
          inserted.push(value);
          return { returning: vi.fn().mockResolvedValue([row]) };
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn((value) => {
          inserted.push(value);
          return Promise.resolve();
        }),
      });
    const response = await app({
      transaction: (callback: (tx: { insert: typeof insert }) => unknown) => callback({ insert }),
    }).request(`/projects/${projectId}/data-deletions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "trace", ids: ["a".repeat(32)] }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ id: requestId, status: "queued" });
    expect(inserted[1]).toMatchObject({
      queue: "maintenance",
      name: "delete-data",
      payload: { requestId },
    });
  });

  it("rejects member writes and malformed identifiers", async () => {
    access.role = "member";
    expect(
      (
        await app({}).request(`/projects/${projectId}/data-deletions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "trace", ids: ["a".repeat(32)] }),
        })
      ).status,
    ).toBe(403);

    access.role = "owner";
    expect(
      (
        await app({}).request(`/projects/${projectId}/data-deletions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "trace", ids: ["not-a-trace"] }),
        })
      ).status,
    ).toBe(400);
  });
});

function app(db: object) {
  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  return api.route(
    "/projects",
    createDataDeletionsRouter({ postgres: { db } } as unknown as ApiDependencies),
  );
}
