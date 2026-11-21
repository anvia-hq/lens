import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessState = vi.hoisted(() => ({ role: "member" }));

vi.mock("../src/utils/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/access.js")>()),
  appMembership: vi.fn(async () => ({
    membership: { role: accessState.role },
    organization: { id: "org-1" },
  })),
}));

import {
  recordProjectKeyUsage,
  resetProjectKeyUsageCache,
} from "../src/modules/ingestion/services.js";
import { createLlmModelsRouter } from "../src/modules/llm-models/router.js";
import { enforcePublicApiRateLimit } from "../src/utils/rate-limit.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

function llmModelsApp() {
  const api = new Hono<AppEnv>();
  api.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  return api.route(
    "/llm-models",
    createLlmModelsRouter({
      postgres: { db: {} },
      clickhouse: {},
    } as unknown as ApiDependencies),
  );
}

describe("LLM models authorization and UUID validation", () => {
  beforeEach(() => {
    accessState.role = "member";
  });

  it("forbids non-admin members from modifying prices or triggering recalculations", async () => {
    const app = llmModelsApp();
    const validPrice = JSON.stringify({
      model: "gpt-4.1-mini",
      inputPricePerMillion: 0.4,
      outputPricePerMillion: 1.6,
    });
    const modelId = "10000000-0000-4000-8000-000000000001";

    for (const [method, path, body] of [
      ["POST", "/llm-models", validPrice],
      ["PATCH", `/llm-models/${modelId}`, validPrice],
      ["DELETE", `/llm-models/${modelId}`, undefined],
      ["POST", "/llm-models/recalculations", JSON.stringify({})],
    ] as const) {
      const response = await app.request(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: { code: "forbidden", message: "Admin access is required" },
      });
    }
  });

  it("returns 404 for malformed modelId UUIDs for admins", async () => {
    accessState.role = "admin";
    const app = llmModelsApp();
    const response = await app.request("/llm-models/not-a-uuid", { method: "DELETE" });
    expect(response.status).toBe(404);
  });
});

describe("project key usage throttling", () => {
  beforeEach(() => {
    resetProjectKeyUsageCache();
  });

  it("throttles repeated lastUsedAt writes per key and retries after failure", async () => {
    const where = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(undefined);
    const update = vi.fn(() => ({ set: () => ({ where }) }));
    const warn = vi.fn();
    const deps = {
      postgres: { db: { update } },
      logger: { warn },
    } as unknown as ApiDependencies;

    recordProjectKeyUsage(deps, "key-1", "project-1", 1_000);
    recordProjectKeyUsage(deps, "key-1", "project-1", 1_000 + 60_000);
    expect(update).toHaveBeenCalledTimes(1);

    // After the 5-minute window elapses, writes resume; if the write fails, the cache entry clears.
    recordProjectKeyUsage(deps, "key-1", "project-1", 1_000 + 5 * 60_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledOnce();

    // Immediate retry succeeds because the failed attempt cleared the cached timestamp.
    recordProjectKeyUsage(deps, "key-1", "project-1", 1_000 + 5 * 60_000 + 1);
    expect(update).toHaveBeenCalledTimes(3);
  });
});

describe("public API rate limiting", () => {
  it("returns 429 when exceeded and 503 when Redis is unavailable", async () => {
    const app = new Hono<AppEnv>();
    const exec = vi.fn();
    const warn = vi.fn();
    const deps = {
      config: { OTLP_RATE_LIMIT_PER_MINUTE: 2 },
      redis: {
        multi: () => ({
          incr() {
            return this;
          },
          expire() {
            return this;
          },
          exec,
        }),
      },
      logger: { warn },
    } as unknown as ApiDependencies;
    app.get("/check", async (c) => {
      const blocked = await enforcePublicApiRateLimit(c, deps, "project-1");
      return blocked ?? c.json({ ok: true });
    });

    exec.mockResolvedValueOnce([[null, 2]]);
    const allowed = await app.request("/check");
    expect(allowed.status).toBe(200);

    exec.mockResolvedValueOnce([[null, 3]]);
    const limited = await app.request("/check");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");

    exec.mockRejectedValueOnce(new Error("redis offline"));
    const unavailable = await app.request("/check");
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Retry-After")).toBe("5");
    expect(warn).toHaveBeenCalledOnce();
  });
});
