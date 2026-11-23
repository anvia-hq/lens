import { createFileRoute } from "@tanstack/react-router";
import { SessionsView } from "../../../modules/observability/components/sessions-view";
import { useSessions } from "../../../modules/observability/hooks/use-sessions";
import type { SessionsSearch } from "../../../modules/observability/types";
import { validateSessionsSearch as normalizeSessionsSearch } from "../../../modules/observability/utils";
import { restoreSavedFilters } from "../../../modules/observability/utils/saved-filters";

export function validateThreadsSearch(search: Record<string, unknown>): SessionsSearch {
  return normalizeSessionsSearch(search);
}

export const Route = createFileRoute("/$projectId/threads/")({
  validateSearch: validateThreadsSearch,
  beforeLoad: restoreSavedFilters("threads", "/$projectId/threads"),
  component: ThreadsPage,
});

function ThreadsPage() {
  const state = useSessions();
  return <SessionsView state={state} />;
}
