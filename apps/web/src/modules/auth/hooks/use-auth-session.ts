import { authClient } from "../../../lib/auth";

export function useAuthSession() {
  return authClient.useSession();
}
