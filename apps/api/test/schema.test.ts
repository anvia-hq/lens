import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { parseSessionRequest } from "../src/modules/sessions/schema";
import { parseMemberRole } from "../src/modules/teams/schema";
import { parseTraceRequest } from "../src/modules/traces/schema";

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
      "/?status=ok&status=error&service=api&page=2&pageSize=100&sort=durationMs&order=asc",
      parseTraceRequest,
    );

    expect(parsed).toEqual({
      filters: { statuses: ["ok", "error"], services: ["api"] },
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
      "status must be ok, error, or unset",
    );
  });

  it("parses session filters and preserves their validation", async () => {
    const parsed = await parseRequest<ReturnType<typeof parseSessionRequest>>(
      "/?status=success&user=user-1&search=checkout&pageSize=25",
      parseSessionRequest,
    );
    expect(parsed).toMatchObject({
      statuses: ["success"],
      users: ["user-1"],
      search: "checkout",
      page: 1,
      pageSize: 25,
      sort: "startedAt",
      order: "desc",
    });
    expect(await parseRequest("/?status=unset", parseSessionRequest)).toBe(
      "status must be success or error",
    );
  });

  it("accepts only mutable team roles", () => {
    expect(parseMemberRole("admin")).toBe("admin");
    expect(parseMemberRole("member")).toBe("member");
    expect(parseMemberRole("owner")).toBeUndefined();
    expect(parseMemberRole(undefined)).toBeUndefined();
  });
});
