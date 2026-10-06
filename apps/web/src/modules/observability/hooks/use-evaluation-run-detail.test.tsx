// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import { validateEvaluationRunDetailSearch } from "../utils";
import { useEvaluationRunDetail } from "./use-evaluation-runs";

vi.mock("../../../lib/api", () => ({ api: vi.fn(), queryString: vi.fn() }));
vi.mock("./use-observability-project", () => ({
  useObservabilityProject: () => ({ project: { id: "project" } }),
}));
vi.mock("./use-data-deletions", () => ({
  useDataDeletions: () => ({ create: { isPending: false, mutate: vi.fn() } }),
}));

function mountAt(url: string) {
  const root = createRootRoute({ component: Outlet });
  const detailRoute = createRoute({
    getParentRoute: () => root,
    path: "/$projectId/evaluations/runs/$runId",
    validateSearch: validateEvaluationRunDetailSearch,
    component: function Probe() {
      const { runId } = detailRoute.useParams();
      const state = useEvaluationRunDetail(runId);
      return (
        <>
          <span data-testid="page">{state.resultPage}</span>
          <span data-testid="case">{state.search.case ?? "none"}</span>
          <button onClick={() => state.selectCase("selected-on-page-two")}>Select case</button>
          <button onClick={() => state.setResultPage(state.resultPage + 1)}>Next</button>
        </>
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([detailRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return {
    router,
    unmount: () => {
      view.unmount();
      queryClient.clear();
    },
  };
}

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ results: [], cases: [] } as never);
});
afterEach(cleanup);

describe("evaluation run detail route state", () => {
  it("preserves page two when selecting, reloading, sharing, and navigating back", async () => {
    const first = mountAt("/project/evaluations/runs/run?page=2");
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: "Select case" }));
    await waitFor(() =>
      expect(first.router.state.location.search).toMatchObject({
        page: 2,
        case: "selected-on-page-two",
      }),
    );
    const sharedUrl = first.router.history.location.href;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("3"));
    expect(screen.getByTestId("case").textContent).toBe("none");
    await act(async () => first.router.history.back());
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("2"));
    expect(screen.getByTestId("case").textContent).toBe("selected-on-page-two");
    first.unmount();

    vi.mocked(api).mockClear();
    const reloaded = mountAt(sharedUrl);
    await waitFor(() =>
      expect(screen.getByTestId("case").textContent).toBe("selected-on-page-two"),
    );
    expect(screen.getByTestId("page").textContent).toBe("2");
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/v1/projects/project/evaluation-runs/run?page=2",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    reloaded.unmount();
  });

  it("defaults new run navigation and old case-only links to page one", async () => {
    const view = mountAt("/project/evaluations/runs/run?page=2&case=old");
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("2"));
    await act(async () =>
      view.router.history.push("/project/evaluations/runs/another?case=legacy-case"),
    );
    await waitFor(() => expect(screen.getByTestId("page").textContent).toBe("1"));
    expect(screen.getByTestId("case").textContent).toBe("legacy-case");
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/v1/projects/project/evaluation-runs/another?page=1",
        expect.anything(),
      ),
    );
    view.unmount();
  });

  it.each([undefined, 0, -1, 1.5, "invalid", Infinity, 1_000_001])(
    "defaults invalid page %s to one",
    (page) => {
      expect(validateEvaluationRunDetailSearch({ page }).page).toBe(1);
    },
  );

  it("accepts bounded integer pages from router search", () => {
    expect(validateEvaluationRunDetailSearch({ page: "2", case: "case-2" })).toEqual({
      page: 2,
      case: "case-2",
    });
    expect(validateEvaluationRunDetailSearch({ page: 1_000_000 }).page).toBe(1_000_000);
  });
});
