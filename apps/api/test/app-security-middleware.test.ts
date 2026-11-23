import type { AddressInfo } from "node:net";
import net from "node:net";
import { serve } from "@hono/node-server";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApiDependencies } from "../src/utils/types.js";

function createTestApp() {
  const getSession = vi.fn(async () => null);
  const deps = {
    config: {
      WEB_ORIGIN: "https://app.lens.test",
      PUBLIC_APP_URL: "https://lens.test",
    },
    auth: {
      api: { getSession },
      handler: vi.fn(async () => new Response(null, { status: 404 })),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    postgres: {},
    clickhouse: {},
    redis: {},
    queues: {},
    systemHealthRedis: {},
    systemHealthQueues: {},
  } as unknown as ApiDependencies;

  return { app: createApp(deps), getSession };
}

function sendRawHttpRequest(port: number, rawRequest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(rawRequest);
    });
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

describe("createApp wildcard security middleware", () => {
  it("enforces session authentication on /api/v1/* including encoded line-terminator paths (GHSA-h7mg-cq63-vhpq)", async () => {
    const { app, getSession } = createTestApp();

    for (const path of [
      "/api/v1/projects",
      "/api/v1/projects%0a",
      "/api/v1/projects/%0a",
      "/api/v1/projects/%0d",
    ]) {
      const response = await app.request(path);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "unauthorized", message: "Sign in is required" },
      });
    }

    expect(getSession).toHaveBeenCalledTimes(4);
  });

  it("blocks disallowed cross-origin mutating requests on /api/v1/* including encoded line-terminator paths", async () => {
    const { app, getSession } = createTestApp();

    for (const path of ["/api/v1/projects", "/api/v1/projects/%0a", "/api/v1/projects/%0d"]) {
      const blocked = await app.request(path, {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(blocked.status).toBe(403);
      expect(await blocked.json()).toEqual({
        error: { code: "forbidden_origin", message: "Origin is not allowed" },
      });
    }

    expect(getSession).not.toHaveBeenCalled();

    const allowedOrigin = await app.request("/api/v1/projects", {
      method: "POST",
      headers: {
        Origin: "https://app.lens.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(allowedOrigin.status).toBe(401);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("applies global security headers and request id middleware on public routes", async () => {
    const { app } = createTestApp();
    const response = await app.request("/health/live");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("@hono/node-server backslash path handling (GHSA-jpvv-r467-5p4w)", () => {
  it("does not normalize backslash characters in request paths into route separators", async () => {
    const { app } = createTestApp();
    const server = serve({
      fetch: app.fetch,
      hostname: "127.0.0.1",
      port: 0,
    });

    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.once("listening", () => resolve());
    });

    try {
      const { port } = server.address() as AddressInfo;

      const control = await sendRawHttpRequest(
        port,
        "GET /health/live HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
      );
      expect(control).toMatch(/^HTTP\/1\.1 200 /);

      for (const rawPath of ["/health\\live", "/internal\\metrics"]) {
        const response = await sendRawHttpRequest(
          port,
          `GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
        );
        expect(response).not.toMatch(/^HTTP\/1\.1 200 /);
        expect(response).toMatch(/^HTTP\/1\.1 (400|404) /);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
