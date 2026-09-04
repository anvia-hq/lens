import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { runQuerySchema } from "../src/modules/evaluation-runs/schema";
import {
  evaluationOverviewQuerySchema,
  evaluationQuerySchema,
} from "../src/modules/evaluations/schema";
import { memberRoleSchema } from "../src/modules/members/schema";
import { sessionDetailQuerySchema, sessionQuerySchema } from "../src/modules/sessions/schema";
import { traceQuerySchema } from "../src/modules/traces/schema";
import { userQuerySchema } from "../src/modules/users/schema";
import { queryInput } from "../src/utils/http";

function queryApp(schema: z.ZodType) {
  return new Hono().get("/", queryInput(schema), (c) => c.json(c.req.valid("query")));
}

async function parseQuery<T>(url: string, schema: z.ZodType): Promise<T> {
  const response = await queryApp(schema).request(url);
  return response.json() as Promise<T>;
}

async function queryError(url: string, schema: z.ZodType): Promise<string> {
  const response = await queryApp(schema).request(url);
  expect(response.status).toBe(400);
  const body = (await response.json()) as { error: { message: string } };
  return body.error.message;
}

describe("API module schemas", () => {
  it("parses trace filters, pagination, and sorting", async () => {
    const parsed = await parseQuery<typeof traceQuerySchema._output>(
      "/?status=running&status=ok&status=error&service=api&review=fail&page=2&pageSize=100&sort=durationMs&order=asc",
      traceQuerySchema,
    );

    expect(parsed).toEqual({
      filters: { statuses: ["running", "ok", "error"], services: ["api"], review: "fail" },
      page: 2,
      pageSize: 100,
      sort: "durationMs",
      order: "asc",
    });
  });

  it("passes overview filters through with the range default", async () => {
    const parsed = await parseQuery<typeof evaluationOverviewQuerySchema._output>(
      "/?range=7d&suite=core&metric=accuracy&outcome=pass&environment=prod&release=v1&source=telemetry&traceId=t-1&search=checkout",
      evaluationOverviewQuerySchema,
    );
    expect(parsed).toEqual({
      range: "7d",
      suites: ["core"],
      metrics: ["accuracy"],
      outcomes: ["pass"],
      environments: ["prod"],
      releases: ["v1"],
      sources: ["telemetry"],
      traceId: "t-1",
      search: "checkout",
    });
  });
  it("preserves trace range validation messages", async () => {
    expect(await queryError("/?minDurationMs=20&maxDurationMs=10", traceQuerySchema)).toBe(
      "minDurationMs must not exceed maxDurationMs",
    );
    expect(await queryError("/?status=success", traceQuerySchema)).toBe(
      "status must be running, ok, error, or unset",
    );
    expect(await queryError("/?review=unknown", traceQuerySchema)).toBe(
      "review must be unreviewed, pass, or fail",
    );
  });

  it("accepts end-user evaluation source filters", async () => {
    expect(
      await parseQuery<typeof evaluationQuerySchema._output>(
        "/?source=end_user",
        evaluationQuerySchema,
      ),
    ).toMatchObject({ filters: { sources: ["end_user"] } });
    expect(await queryError("/?source=external", evaluationQuerySchema)).toBe(
      "source must be telemetry, human, or end_user",
    );
  });

  it("parses exact trace users and user explorer queries", async () => {
    expect(
      await parseQuery<typeof traceQuerySchema._output>(
        "/?exactUserId=Customer%2FOne",
        traceQuerySchema,
      ),
    ).toMatchObject({ filters: { exactUserId: "Customer/One" } });
    expect(
      await parseQuery<typeof userQuerySchema._output>(
        "/?search=customer&sort=totalCost&order=asc&pageSize=25",
        userQuerySchema,
      ),
    ).toEqual({
      search: "customer",
      page: 1,
      pageSize: 25,
      sort: "totalCost",
      order: "asc",
    });
    expect(await queryError("/?sort=startedAt", userQuerySchema)).toBe(
      "Unsupported user sort field",
    );
  });

  it("parses session filters and preserves their validation", async () => {
    const parsed = await parseQuery<typeof sessionQuerySchema._output>(
      "/?status=running&user=user-1&search=checkout&pageSize=25",
      sessionQuerySchema,
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
    expect(await queryError("/?status=unset", sessionQuerySchema)).toBe(
      "status must be running, success, or error",
    );
  });

  it("validates session detail cursors and page sizes", async () => {
    const cursor = Buffer.from(JSON.stringify(["2026-08-05T00:00:00.000Z", "trace-1"])).toString(
      "base64url",
    );
    expect(
      await parseQuery<typeof sessionDetailQuerySchema._output>(
        `/?pageSize=25&cursor=${cursor}`,
        sessionDetailQuerySchema,
      ),
    ).toEqual({
      pageSize: 25,
      cursor: { startedAt: "2026-08-05T00:00:00.000Z", traceId: "trace-1" },
    });
    expect(await queryError("/?pageSize=10", sessionDetailQuerySchema)).toBe(
      "pageSize must be 25, 50, or 100",
    );
    expect(await queryError("/?cursor=invalid", sessionDetailQuerySchema)).toBe(
      "cursor is invalid",
    );
  });

  it("accepts only mutable member roles", () => {
    expect(memberRoleSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(memberRoleSchema.safeParse({ role: "member" }).success).toBe(true);
    expect(memberRoleSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(memberRoleSchema.safeParse({}).success).toBe(false);
  });

  it("parses evaluation run filters and rejects invalid statuses", async () => {
    expect(
      await parseQuery<typeof runQuerySchema._output>(
        "/?suite=release-gate&status=completed&environment=production&pageSize=100&sort=passRate&order=asc",
        runQuerySchema,
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
    expect(await queryError("/?status=unknown", runQuerySchema)).toBe(
      "status must be running, completed, or failed",
    );
    expect(await queryError("/?sort=unknown", runQuerySchema)).toBe(
      "Unsupported evaluation run sort field",
    );
  });
});
