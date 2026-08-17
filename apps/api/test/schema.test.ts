import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { parseRunRequest } from "../src/modules/evaluation-runs/schema";
import { parseMemberRole } from "../src/modules/members/schema";
import { parseSessionDetailRequest, parseSessionRequest } from "../src/modules/sessions/schema";
import { parseTraceRequest } from "../src/modules/traces/schema";
import { parseUserRequest } from "../src/modules/users/schema";

async function parseRequest<T>(url: string, parser: Parameters<typeof parserApp>[0]): Promise<T> {
  const response = await parserApp(parser).request(url);
  return response.json() as Promise<T>;
}

function parserApp(parser: (context: Parameters<typeof parseTraceRequest>[0]) => unknown) {
  return new Hono().get("/", (c) => c.json(parser(c)));
}

describe("API module schemas", () => {
  it("parses trace filters, pagination, and sorting", async () => {
    const parsed = await parseRequest<ReturnType<typeof parseTraceRequest>>(
      "/?status=running&status=ok&status=error&service=api&review=fail&page=2&pageSize=100&sort=durationMs&order=asc",
      parseTraceRequest,
    );

    expect(parsed).toEqual({
      filters: { statuses: ["running", "ok", "error"], services: ["api"], review: "fail" },
      page: 2,
      pageSize: 100,
      sort: "durationMs",
      order: "asc",
    });
  });

  it("preserves trace range validation messages", async () => {
    expect(await parseRequest("/?minDurationMs=20&maxDurationMs=10", parseTraceRequest)).toBe(
      "minDurationMs must not exceed maxDurationMs",
    );
    expect(await parseRequest("/?status=success", parseTraceRequest)).toBe(
      "status must be running, ok, error, or unset",
    );
    expect(await parseRequest("/?review=unknown", parseTraceRequest)).toBe(
      "review must be unreviewed, pass, or fail",
    );
  });

  it("parses exact trace users and user explorer queries", async () => {
    expect(
      await parseRequest<ReturnType<typeof parseTraceRequest>>(
        "/?exactUserId=Customer%2FOne",
        parseTraceRequest,
      ),
    ).toMatchObject({ filters: { exactUserId: "Customer/One" } });
    expect(
      await parseRequest<ReturnType<typeof parseUserRequest>>(
        "/?search=customer&sort=totalCost&order=asc&pageSize=25",
        parseUserRequest,
      ),
    ).toEqual({
      search: "customer",
      page: 1,
      pageSize: 25,
      sort: "totalCost",
      order: "asc",
    });
    expect(await parseRequest("/?sort=startedAt", parseUserRequest)).toBe(
      "Unsupported user sort field",
    );
  });

  it("parses session filters and preserves their validation", async () => {
    const parsed = await parseRequest<ReturnType<typeof parseSessionRequest>>(
      "/?status=running&user=user-1&search=checkout&pageSize=25",
      parseSessionRequest,
    );
    expect(parsed).toMatchObject({
      statuses: ["running"],
      users: ["user-1"],
      search: "checkout",
      page: 1,
      pageSize: 25,
      sort: "startedAt",
      order: "desc",
    });
    expect(await parseRequest("/?status=unset", parseSessionRequest)).toBe(
      "status must be running, success, or error",
    );
  });

  it("validates session detail cursors and page sizes", async () => {
    const cursor = Buffer.from(JSON.stringify(["2026-08-05T00:00:00.000Z", "trace-1"])).toString(
      "base64url",
    );
    expect(
      await parseRequest<ReturnType<typeof parseSessionDetailRequest>>(
        `/?pageSize=25&cursor=${cursor}`,
        parseSessionDetailRequest,
      ),
    ).toEqual({
      pageSize: 25,
      cursor: { startedAt: "2026-08-05T00:00:00.000Z", traceId: "trace-1" },
    });
    expect(await parseRequest("/?pageSize=10", parseSessionDetailRequest)).toBe(
      "pageSize must be 25, 50, or 100",
    );
    expect(await parseRequest("/?cursor=invalid", parseSessionDetailRequest)).toBe(
      "cursor is invalid",
    );
  });

  it("accepts only mutable member roles", () => {
    expect(parseMemberRole("admin")).toBe("admin");
    expect(parseMemberRole("member")).toBe("member");
    expect(parseMemberRole("owner")).toBeUndefined();
    expect(parseMemberRole(undefined)).toBeUndefined();
  });

  it("parses evaluation run filters and rejects invalid statuses", async () => {
    expect(
      await parseRequest<ReturnType<typeof parseRunRequest>>(
        "/?suite=release-gate&status=completed&environment=production&pageSize=100&sort=passRate&order=asc",
        parseRunRequest,
      ),
    ).toEqual({
      suites: ["release-gate"],
      statuses: ["completed"],
      environments: ["production"],
      page: 1,
      pageSize: 100,
      sort: "passRate",
      order: "asc",
    });
    expect(await parseRequest("/?status=unknown", parseRunRequest)).toBe(
      "status must be running, completed, or failed",
    );
    expect(await parseRequest("/?sort=unknown", parseRunRequest)).toBe(
      "Unsupported evaluation run sort field",
    );
  });
});
