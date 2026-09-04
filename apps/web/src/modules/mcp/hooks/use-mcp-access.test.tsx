// @vitest-environment happy-dom

import type { CreatedMcpToken } from "@lens/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../../lib/api";
import { useMcpAccess } from "./use-mcp-access";

vi.mock("../../../lib/api", () => ({ api: vi.fn() }));
vi.mock("../../projects/utils", () => ({ notify: vi.fn() }));
vi.mock("../../projects/hooks/use-project", () => ({
  useProject: () => ({
    project: {
      id: "10000000-0000-4000-8000-000000000001",
      role: "owner",
      settings: { retentionDays: 30 },
    },
  }),
}));

describe("useMcpAccess", () => {
  it("creates workspace tokens and resets raw payload access", async () => {
    const created: CreatedMcpToken = {
      id: "20000000-0000-4000-8000-000000000001",
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
    const { result } = renderHook(() => useMcpAccess(), { wrapper });

    act(() => result.current.setAllowRawPayloads(true));
    await waitFor(() => expect(result.current.allowRawPayloads).toBe(true));
    await act(() => result.current.createMcpToken.mutateAsync());

    const createCall = vi.mocked(api).mock.calls.find(([, options]) => options?.method === "POST");
    expect(createCall?.[0]).toBe("/api/v1/mcp-tokens");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ allowRawPayloads: true });
    expect(result.current.allowRawPayloads).toBe(false);
    expect(result.current.newMcpToken).toMatchObject({ token: created.token });

    const listCall = vi
      .mocked(api)
      .mock.calls.find(([path, options]) => path === "/api/v1/mcp-tokens" && !options);
    expect(listCall).toBeDefined();
  });

  it("revokes tokens through the workspace endpoint", async () => {
    vi.mocked(api).mockResolvedValue({ items: [] } as never);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMcpAccess(), { wrapper });

    await act(() =>
      result.current.revokeMcpToken.mutateAsync("20000000-0000-4000-8000-000000000001"),
    );

    const revokeCall = vi
      .mocked(api)
      .mock.calls.find(([, options]) => options?.method === "DELETE");
    expect(revokeCall?.[0]).toBe("/api/v1/mcp-tokens/20000000-0000-4000-8000-000000000001");
  });
});
