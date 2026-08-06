import { SessionsView } from "../modules/observability/components/sessions-view";
import { useSessions } from "../modules/observability/hooks/use-sessions";
import type { SessionsSearch } from "../modules/observability/types";
import { validateSessionsSearch as normalizeSessionsSearch } from "../modules/observability/utils";

export function validateSessionsSearch(search: Record<string, unknown>): SessionsSearch {
  return normalizeSessionsSearch(search);
}

export function SessionsPage() {
  const state = useSessions();
  return <SessionsView state={state} />;
}
