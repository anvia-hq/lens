import { gunzipSync } from "node:zlib";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { describe, expect, it } from "vitest";
import { cachedJson } from "../src/modules/traces/router.js";
import type { AppEnv } from "../src/utils/types.js";

describe("trace response transport", () => {
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
