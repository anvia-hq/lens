import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const mocks = vi.hoisted(() => ({ detail: vi.fn(), cases: vi.fn(), fullDataset: vi.fn() }));
vi.mock("@lens/db", async (original) => ({
  ...(await original()),
  getEvaluationRunDetail: mocks.detail,
  getPublishedManagedDatasetCases: mocks.cases,
  getPublishedManagedDataset: mocks.fullDataset,
}));
vi.mock("../src/utils/access.js", () => ({
  requireProjectAccess: vi.fn(async () => ({ project: { id: "project" }, role: "owner" })),
}));
import { createEvaluationRunsRouter } from "../src/modules/evaluation-runs/router.js";

function app() {
  const router = new Hono<AppEnv>();
  router.use("*", async (c, next) => {
    c.set("session", { user: { id: "user" } } as NonNullable<AppEnv["Variables"]["session"]>);
    await next();
  });
  router.route(
    "/projects",
    createEvaluationRunsRouter({ postgres: { db: {} }, clickhouse: {} } as ApiDependencies),
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cases.mockResolvedValue([{ id: "case-101", input: "only requested payload" }]);
});

describe("evaluation run dataset hydration", () => {
  it("requests only distinct non-null current-page case IDs from the scoped published lookup", async () => {
    mocks.detail.mockResolvedValue({
      run: { datasetName: "dataset", datasetVersion: "v2" },
      cases: [
        { caseId: "case-101" },
        { caseId: "case-101" },
        { caseId: "missing" },
        { caseId: null },
      ],
      resultsPage: { page: 2 },
    });
    const response = await app().request("/projects/project/evaluation-runs/run?page=2");
    expect(response.status).toBe(200);
    expect(mocks.cases).toHaveBeenCalledExactlyOnceWith({}, "project", "dataset", "v2", [
      "case-101",
      "missing",
    ]);
    expect(mocks.fullDataset).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      cases: [
        { caseId: "case-101", datasetItem: { id: "case-101" } },
        { caseId: "case-101", datasetItem: { id: "case-101" } },
        { caseId: "missing", datasetItem: null },
        { caseId: null, datasetItem: null },
      ],
    });
    expect(mocks.detail).toHaveBeenCalledWith(
      {},
      "project",
      "run",
      expect.objectContaining({ page: 2 }),
    );
  });

  it.each([{ cases: [] }, { cases: [{ caseId: null }] }])(
    "skips PostgreSQL hydration when no case IDs are present",
    async ({ cases }) => {
      mocks.detail.mockResolvedValue({
        run: { datasetName: "dataset", datasetVersion: "v2" },
        cases,
      });
      expect((await app().request("/projects/project/evaluation-runs/run")).status).toBe(200);
      expect(mocks.cases).not.toHaveBeenCalled();
      expect(mocks.fullDataset).not.toHaveBeenCalled();
    },
  );
});
