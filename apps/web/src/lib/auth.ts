import type { QueryClient } from "@tanstack/react-query";
import { genericOAuthClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient(), genericOAuthClient()],
});

export async function signOutAndClearCache(queryClient: QueryClient): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    queryClient.clear();
  }
}
