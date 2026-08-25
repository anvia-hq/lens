// @vitest-environment happy-dom

import type { CreatedProjectMcpToken } from "@lens/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import { useProjectSettings } from "./use-project-settings";

vi.mock("../../../lib/api", () => ({ api: vi.fn() }));
vi.mock("../utils", () => ({ notify: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("./use-project", () => ({
  useProject: () => ({
    project: {
      id: "10000000-0000-4000-8000-000000000001",
      role: "owner",
      settings: { retentionDays: 30 },
    },
  }),
}));

describe("useProjectSettings", () => {
  it("resets raw payload access after creating a token", async () => {
    const created: CreatedProjectMcpToken = {
      id: "20000000-0000-4000-8000-000000000001",
      projectId: "10000000-0000-4000-8000-000000000001",
      name: "AI assistant",
      tokenPrefix: "mcp-lens-prefix",
      token: `mcp-lens-${"a".repeat(43)}`,
      allowRawPayloads: true,
      createdAt: "2026-08-25T00:00:00.000Z",
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    };
    vi.mocked(api).mockImplementation(async (_path, options) => {
      if (options?.method === "POST") return created as never;
      return { items: [] } as never;
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProjectSettings(), { wrapper });

    act(() => result.current.setAllowRawPayloads(true));
    await waitFor(() => expect(result.current.allowRawPayloads).toBe(true));
    await act(() => result.current.createMcpToken.mutateAsync());

    const createCall = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ allowRawPayloads: true });
    expect(result.current.allowRawPayloads).toBe(false);
  });
});
