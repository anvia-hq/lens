import { gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { describe, expect, it, vi } from "vitest";
import { cachedJson, createTracesRouter } from "../src/modules/traces/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const mocks = vi.hoisted(() => ({ getTrace: vi.fn() }));
vi.mock("@lens/db", async (original) => ({
  ...(await original()),
  getTrace: mocks.getTrace,
}));
vi.mock("../src/utils/access.js", () => ({
  requireProjectAccess: vi.fn(async () => ({ role: "owner" })),
}));

describe("trace response transport", () => {
  it("preserves evaluation totals and truncation in the trace detail response", async () => {
    const trace = {
      summary: { traceId: "trace-1" },
      spans: [],
      evaluations: Array.from({ length: 100 }, (_, index) => ({ id: `evaluation-${index}` })),
      evaluationsTotal: 101,
      evaluationsTruncated: true,
    };
    mocks.getTrace.mockResolvedValue(trace);
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("session", { user: { id: "user" } } as NonNullable<AppEnv["Variables"]["session"]>);
      await next();
    });
    app.route(
      "/projects",
      createTracesRouter({
        postgres: { db: {} },
        clickhouse: {},
        logger: { info: vi.fn() },
      } as unknown as ApiDependencies),
    );

    const response = await app.request("/projects/project/traces/trace-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(trace);
  });

  it("supports private ETag revalidation", async () => {
    const app = new Hono<AppEnv>().get("/", (c) => cachedJson(c, JSON.stringify({ ok: true })));
    const first = await app.request("/");
    const tag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    expect(tag).toBeTruthy();

    const revalidated = await app.request("/", { headers: { "If-None-Match": tag ?? "" } });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
  });

  it("compresses large JSON responses", async () => {
    const app = new Hono()
      .use(compress({ threshold: 1_024 }))
      .get("/", (c) => c.json({ value: "compressible".repeat(2_000) }));
    const response = await app.request("/", { headers: { "Accept-Encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    const decoded = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
    expect(JSON.parse(decoded)).toMatchObject({ value: expect.stringContaining("compressible") });
  });
});
