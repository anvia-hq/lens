// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import {
  validateEvaluationResultsSearch,
  validateEvaluationRunsSearch,
  validateSessionsSearch,
  validateTracesSearch,
  validateUsersSearch,
} from "../utils";
import { useEvaluationRuns } from "./use-evaluation-runs";
import { useEvaluations } from "./use-evaluations";
import { useSessions } from "./use-sessions";
import { useTraces } from "./use-traces";
import { useUsers } from "./use-users";

const router = vi.hoisted(() => ({ filters: {}, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => router.filters,
  useNavigate: () => router.navigate,
}));
vi.mock("./use-observability-project", () => ({
  useObservabilityProject: () => ({ project: { id: "project-1" } }),
}));
vi.mock("./use-data-deletions", () => ({ useDataDeletions: () => ({}) }));
vi.mock("../../../lib/api", async (original) => ({
  ...(await original<typeof import("../../../lib/api")>()),
  api: vi.fn(),
}));

const initialTime = Date.parse("2026-10-06T12:00:00Z");
const activityTime = initialTime + 2_000;
const cases = [
  {
    name: "traces",
    validate: validateTracesSearch,
    useState: () => {
      const state = useTraces();
      return { ...state, list: state.traces };
    },
  },
  {
    name: "sessions",
    validate: validateSessionsSearch,
    useState: () => {
      const state = useSessions();
      return { ...state, list: state.sessions };
    },
  },
  {
    name: "evaluation-runs",
    validate: validateEvaluationRunsSearch,
    useState: () => {
      const state = useEvaluationRuns();
      return { ...state, list: state.runs };
    },
  },
  {
    name: "evaluations",
    validate: validateEvaluationResultsSearch,
    useState: () => {
      const state = useEvaluations();
      return { ...state, list: state.evaluations };
    },
  },
  {
    name: "users",
    validate: validateUsersSearch,
    useState: () => {
      const state = useUsers();
      return { ...state, list: state.users };
    },
  },
];
let client: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(initialTime);
  router.navigate.mockClear();
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (path) => {
      const url = new URL(path, "http://localhost");
      const to = url.searchParams.get("to");
      const total = to === null || Date.parse(to) >= activityTime ? 1 : 0;
      return { items: [], total } as never;
    });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

function requests(name: string) {
  return vi
    .mocked(api)
    .mock.calls.map(([path]) => new URL(path, "http://localhost"))
    .filter((url) => url.pathname.endsWith(`/${name}`) || url.pathname.endsWith(`/${name}/facets`));
}

describe("rolling list refresh", () => {
  it.each(cases)(
    "advances $name bounds and displayed activity without changing keys or filters",
    async (entry) => {
      router.filters = entry.validate({ range: "24h", page: 3, search: "service" });
      function View() {
        const { list } = entry.useState();
        return <output>{list.data?.total ?? "loading"}</output>;
      }
      render(
        <QueryClientProvider client={client}>
          <View />
        </QueryClientProvider>,
      );
      await advance(1);
      expect(screen.getByRole("status").textContent).toBe("0");
      const keys = client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryHash);
      const initial = requests(entry.name);
      const count = initial.length;
      expect(count).toBe(entry.name === "users" ? 1 : 2);
      expect(
        initial.every((url) => url.searchParams.get("to") === new Date(initialTime).toISOString()),
      ).toBe(true);

      await advance(entry.name === "users" ? 30_000 : 5_000);
      expect(screen.getByRole("status").textContent).toBe("1");
      const refreshed = requests(entry.name).slice(count);
      expect(refreshed).toHaveLength(count);
      for (const url of refreshed) {
        expect(Date.parse(url.searchParams.get("to")!)).toBeGreaterThanOrEqual(activityTime);
        expect(
          Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!),
        ).toBe(86_400_000);
        expect(url.searchParams.get("search")).toBe("service");
        if (!url.pathname.endsWith("/facets")) expect(url.searchParams.get("page")).toBe("3");
      }
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryHash),
      ).toEqual(keys);
      expect(router.navigate).not.toHaveBeenCalled();
      await advance(500);
      expect(requests(entry.name)).toHaveLength(count * 2);
    },
  );

  it("refetches list and facets when the preset changes without resetting pagination", async () => {
    router.filters = validateTracesSearch({ range: "24h", page: 3 });
    function View() {
      useTraces();
      return null;
    }
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>,
    );
    await advance(1);
    router.filters = validateTracesSearch({ range: "30d", page: 3 });
    rerender(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>,
    );
    await advance(1);
    const changed = requests("traces").slice(2);
    expect(changed).toHaveLength(2);
    for (const url of changed) {
      expect(
        Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!),
      ).toBe(30 * 86_400_000);
      if (!url.pathname.endsWith("/facets")) expect(url.searchParams.get("page")).toBe("3");
    }
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("keeps all-time users unbounded across polling", async () => {
    router.filters = validateUsersSearch({ range: "all" });
    function View() {
      useUsers();
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>,
    );
    await advance(1);
    await advance(30_000);
    expect(requests("users")).toHaveLength(2);
    for (const url of requests("users")) {
      expect(url.searchParams.has("from")).toBe(false);
      expect(url.searchParams.has("to")).toBe(false);
    }
  });

  it("stops polling when Off and resolves a fresh range for manual refresh", async () => {
    router.filters = validateTracesSearch({ range: "7d" });
    let state: ReturnType<typeof useTraces>;
    function View() {
      state = useTraces();
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>,
    );
    await advance(1);
    act(() => state.setRefreshInterval("Off"));
    await advance(30_000);
    expect(requests("traces")).toHaveLength(2);
    await act(async () => {
      await state.traces.refetch();
      await state.facets.refetch();
    });
    for (const url of requests("traces").slice(2)) {
      expect(Date.parse(url.searchParams.get("to")!)).toBeGreaterThan(initialTime + 30_000);
      expect(
        Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!),
      ).toBe(7 * 86_400_000);
    }
  });
});
