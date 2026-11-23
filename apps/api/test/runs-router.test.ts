import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunsRouter } from "../src/modules/runs/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  listRunFacets: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

vi.mock("@lens/db", async (original) => ({
  ...(await original()),
  listRuns: mocks.listRuns,
  listRunFacets: mocks.listRunFacets,
}));

vi.mock("../src/utils/access.js", () => ({
  requireProjectAccess: mocks.requireProjectAccess,
}));

function makeApp() {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as NonNullable<AppEnv["Variables"]["session"]>);
    await next();
  });
  app.route(
    "/projects",
    createRunsRouter({
      postgres: { db: {} },
      clickhouse: {},
    } as unknown as ApiDependencies),
  );
  return app;
}

describe("runs router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectAccess.mockResolvedValue({ role: "owner" });
  });

  it("lists filtered runs and validates query parameters", async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 };
    mocks.listRuns.mockResolvedValue(page);
    const app = makeApp();

    const response = await app.request(
      "/projects/project-1/runs?observationKind=generation&observationKind=tool&status=error&pageSize=25&sort=durationMs&order=desc",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(mocks.listRuns).toHaveBeenCalledWith(
      expect.anything(),
      "project-1",
      expect.objectContaining({
        observationKinds: ["generation", "tool"],
        statuses: ["error"],
        page: 1,
        pageSize: 25,
        sort: "durationMs",
        order: "desc",
      }),
    );
  });

  it("returns 400 for invalid observationKind", async () => {
    const app = makeApp();
    const response = await app.request("/projects/project-1/runs?observationKind=invalid");
    expect(response.status).toBe(400);
    expect(mocks.listRuns).not.toHaveBeenCalled();
  });

  it("returns run facets and enforces project access", async () => {
    const facets = {
      observationKind: [{ value: "tool", count: 3 }],
      status: [],
      service: [],
      name: [],
      model: [],
      environment: [],
      release: [],
      version: [],
      serviceVersion: [],
      tag: [],
    };
    mocks.listRunFacets.mockResolvedValue(facets);
    const app = makeApp();

    const ok = await app.request("/projects/project-1/runs/facets?observationKind=tool");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(facets);

    mocks.requireProjectAccess.mockResolvedValue(undefined);
    const missing = await app.request("/projects/project-1/runs");
    expect(missing.status).toBe(404);
  });
});
