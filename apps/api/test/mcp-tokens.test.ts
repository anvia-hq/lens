import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpTokensRouter } from "../src/modules/mcp-tokens/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const access = vi.hoisted(() => ({ role: "owner" }));

vi.mock("../src/utils/access.js", () => ({
  appMembership: vi.fn().mockImplementation(() =>
    Promise.resolve({
      membership: { role: access.role },
      organization: { id: "org-1" },
    }),
  ),
  canManage: (role: string) => role === "owner" || role === "admin",
}));

beforeEach(() => {
  access.role = "owner";
});

describe("MCP token management", () => {
  it("creates a workspace-global token and only returns its secret once", async () => {
    const { app, inserted } = testApp();
    const response = await app.request("/mcp-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "AI assistant", allowRawPayloads: true, expiresAt: null }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: string; tokenPrefix: string };
    expect(body.token).toMatch(/^mcp-lens-[A-Za-z0-9_-]{43}$/);
    expect(body.tokenPrefix).toBe(body.token.slice(0, 21));
    expect(inserted()).toMatchObject({
      name: "AI assistant",
      allowRawPayloads: true,
      createdBy: "user-1",
    });
    expect(inserted()).not.toHaveProperty("projectId");
    expect(inserted()).not.toHaveProperty("token");
  });

  it("lists token metadata without returning secrets or hashes", async () => {
    const { app } = testApp();
    const response = await app.request("/mcp-tokens");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({
      items: [{ name: "AI assistant", tokenPrefix: "mcp-lens-prefix" }],
    });
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain("stored-token-hash");
    expect(text).not.toContain('"token"');
    expect(text).not.toContain("projectId");
  });

  it("revokes a token by id alone", async () => {
    const { app, update, updatePredicate, updateWhere } = testApp();
    const response = await app.request("/mcp-tokens/20000000-0000-4000-8000-000000000001", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(update).toHaveBeenCalledOnce();
    expect(updateWhere).toHaveBeenCalledOnce();
    const predicate = updatePredicate();
    expect(predicate).toBeDefined();
    expect(new PgDialect().sqlToQuery(predicate as SQL)).toMatchObject({
      sql: expect.stringContaining('"mcp_tokens"."id" = $1'),
      params: ["20000000-0000-4000-8000-000000000001"],
    });
  });

  it("rejects an expiry that is not in the future", async () => {
    const { app, insert } = testApp();
    const response = await app.request("/mcp-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Expired", expiresAt: "2020-01-01T00:00:00.000Z" }),
    });
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["create", "/mcp-tokens", "POST"],
    ["list", "/mcp-tokens", "GET"],
    ["revoke", "/mcp-tokens/20000000-0000-4000-8000-000000000001", "DELETE"],
  ])("requires an owner or admin to %s tokens", async (_action, path, method) => {
    access.role = "member";
    const { app, insert, select, update } = testApp();
    const response = await app.request(path, {
      method,
      ...(method === "POST"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Denied" }),
          }
        : {}),
    });
    expect(response.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

function testApp() {
  let insertedValue: Record<string, unknown> | undefined;
  const createdAt = new Date("2026-08-25T00:00:00.000Z");
  const returning = vi.fn(async () => [
    {
      id: "20000000-0000-4000-8000-000000000001",
      name: insertedValue?.name,
      tokenPrefix: insertedValue?.tokenPrefix,
      tokenHash: insertedValue?.tokenHash,
      allowRawPayloads: insertedValue?.allowRawPayloads,
      createdBy: "user-1",
      createdAt,
      expiresAt: insertedValue?.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
    },
  ]);
  const values = vi.fn((value: Record<string, unknown>) => {
    insertedValue = value;
    return { returning };
  });
  const insert = vi.fn(() => ({ values }));
  const storedRow = {
    id: "20000000-0000-4000-8000-000000000001",
    name: "AI assistant",
    tokenPrefix: "mcp-lens-prefix",
    tokenHash: "stored-token-hash",
    allowRawPayloads: false,
    createdBy: "user-1",
    createdAt,
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
  };
  const orderBy = vi.fn(async () => [storedRow]);
  const select = vi.fn(() => ({ from: () => ({ orderBy }) }));
  let predicate: SQL | undefined;
  const updateWhere = vi.fn(async (value: SQL) => {
    predicate = value;
  });
  const update = vi.fn(() => ({ set: () => ({ where: updateWhere }) }));
  const deps = {
    config: { INGESTION_KEY_PEPPER: "test-mcp-token-pepper" },
    postgres: { db: { insert, select, update } },
  } as unknown as ApiDependencies;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  app.route("/mcp-tokens", createMcpTokensRouter(deps));
  return {
    app,
    insert,
    inserted: () => insertedValue,
    select,
    update,
    updatePredicate: () => predicate,
    updateWhere,
  };
}
