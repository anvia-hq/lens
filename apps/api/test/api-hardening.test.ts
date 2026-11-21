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

import { createLlmModelsRouter } from "../src/modules/llm-models/router.js";
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
