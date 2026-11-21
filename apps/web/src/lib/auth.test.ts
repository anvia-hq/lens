import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: signOutMock,
  }),
}));

import { signOutAndClearCache } from "./auth";

describe("signOutAndClearCache", () => {
  it("clears cached queries after sign-out resolves or rejects", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["projects"], [{ id: "p-1" }]);

    signOutMock.mockResolvedValueOnce(undefined);
    await signOutAndClearCache(queryClient);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();

    queryClient.setQueryData(["projects"], [{ id: "p-2" }]);
    signOutMock.mockRejectedValueOnce(new Error("network failure"));
    await expect(signOutAndClearCache(queryClient)).rejects.toThrow("network failure");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });
});
