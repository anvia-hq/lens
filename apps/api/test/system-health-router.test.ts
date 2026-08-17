import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectSystemHealth } from "../src/modules/system/health.js";
import { createSystemHealthRouter } from "../src/modules/system/health-router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const access = vi.hoisted(() => ({ role: "owner" }));

vi.mock("../src/utils/access.js", () => ({
  appMembership: vi.fn().mockImplementation(() =>
    Promise.resolve({
      membership: { role: access.role },
      organization: { id: "organization-1" },
    }),
  ),
  canManage: (role: string) => role === "owner" || role === "admin",
}));

vi.mock("../src/modules/system/health.js", () => ({ collectSystemHealth: vi.fn() }));

beforeEach(() => {
  access.role = "owner";
  vi.mocked(collectSystemHealth)
    .mockReset()
    .mockResolvedValue({
      sampledAt: "2026-08-17T00:00:00.000Z",
      overall: "healthy",
    } as never);
});

describe("system health API access", () => {
  it("allows owners and disables response caching", async () => {
    const response = await app().request("/system/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(collectSystemHealth).toHaveBeenCalledTimes(1);
  });

  it("rejects members without collecting infrastructure details", async () => {
    access.role = "member";
    const response = await app().request("/system/health");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "forbidden", message: "Admin access is required" },
    });
    expect(collectSystemHealth).not.toHaveBeenCalled();
  });
});

function app() {
  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  return api.route(
    "/system",
    createSystemHealthRouter({ postgres: { db: {} } } as ApiDependencies),
  );
}
