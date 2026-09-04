import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createMcpRouter } from "../src/modules/mcp/router.js";
import { createApiMetrics } from "../src/utils/metrics.js";
import { createMcpCredentials } from "../src/utils/security.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const projectId = "10000000-0000-4000-8000-000000000001";
const pepper = "test-mcp-token-pepper";

describe("remote MCP endpoint", () => {
  it("requires a Lens MCP Bearer token", async () => {
    const { app } = testApp();
    const response = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: "lens.example.com" },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="Lens MCP"');
  });

  it("rejects untrusted browser origins before authentication", async () => {
    const { app, select } = testApp();
    const token = createMcpCredentials(pepper).token;
    const response = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "lens.example.com",
        Origin: "https://attacker.example.com",
      },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(403);
    expect(select).not.toHaveBeenCalled();
  });

  it("rejects untrusted hosts before authentication", async () => {
    const { app, select } = testApp();
    const token = createMcpCredentials(pepper).token;
    const response = await app.request("https://attacker.example.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Host: "attacker.example.com",
      },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(403);
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked", { revokedAt: new Date("2026-08-24T00:00:00.000Z") }],
    ["expired", { expiresAt: new Date("2026-08-24T00:00:00.000Z") }],
  ])("rejects a %s token", async (_label, tokenState) => {
    const { app } = testApp(tokenState);
    const token = createMcpCredentials(pepper).token;
    const response = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Host: "lens.example.com",
      },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(401);
  });

  it("serves the MCP initialization handshake for an active token", async () => {
    const { app } = testApp();
    const token = createMcpCredentials(pepper).token;
    const response = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: "lens.example.com",
      },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("anvia-lens");
  });

  it("serves authenticated tool discovery and calls through the HTTP transport", async () => {
    const { app } = testApp();
    const token = createMcpCredentials(pepper).token;
    const listResponse = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: mcpHeaders(token),
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.text()).toContain("get_overview");

    const callResponse = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: mcpHeaders(token),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_span",
          arguments: {
            projectId,
            traceId: "trace-1",
            spanId: "span-1",
            includePayload: true,
          },
        },
      }),
    });
    expect(callResponse.status).toBe(200);
    expect(await callResponse.text()).toContain("payload_access_denied");
  });

  it("returns 429 with retry guidance when the token exceeds its rate limit", async () => {
    const { app } = testApp({ rateCount: 121 });
    const token = createMcpCredentials(pepper).token;
    const response = await app.request("https://lens.example.com/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Host: "lens.example.com",
      },
      body: JSON.stringify(initializeRequest),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "lens-test", version: "1.0.0" },
  },
};

function mcpHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-06-18",
    Host: "lens.example.com",
  };
}

function testApp(options: { rateCount?: number; expiresAt?: Date; revokedAt?: Date } = {}) {
  const tokenRow = {
    id: "20000000-0000-4000-8000-000000000001",
    allowRawPayloads: false,
    expiresAt: options.expiresAt ?? null,
    revokedAt: options.revokedAt ?? null,
  };
  const projectRow = {
    id: projectId,
    name: "Support",
    slug: "support",
    state: "active",
  };
  const select = vi.fn().mockImplementation((projection: unknown) => {
    const result = projection === undefined ? [tokenRow] : [projectRow];
    return {
      from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue(result) }) }),
    };
  });
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn(() => ({ set: () => ({ where: updateWhere }) }));
  const multi = () => {
    const transaction = {
      incr: () => transaction,
      expire: () => transaction,
      exec: vi.fn().mockResolvedValue([
        [null, options.rateCount ?? 1],
        [null, 1],
      ]),
    };
    return transaction;
  };
  const deps = {
    config: {
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://lens.example.com",
      WEB_ORIGIN: "https://lens.example.com",
      API_PORT: 3001,
      INGESTION_KEY_PEPPER: pepper,
      MCP_RATE_LIMIT_PER_MINUTE: 120,
    },
    postgres: { db: { select, update } },
    redis: { multi },
    clickhouse: {},
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as ApiDependencies;
  const app = new Hono<AppEnv>().route("/api/mcp", createMcpRouter(deps, createApiMetrics()));
  return { app, select };
}
