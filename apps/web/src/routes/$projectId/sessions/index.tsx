import { createFileRoute, redirect } from "@tanstack/react-router";
import type { SessionsSearch } from "../../../modules/observability/types";
import { validateSessionsSearch as normalizeSessionsSearch } from "../../../modules/observability/utils";

export function validateSessionsSearch(search: Record<string, unknown>): SessionsSearch {
  return normalizeSessionsSearch(search);
}

export const Route = createFileRoute("/$projectId/sessions/")({
  validateSearch: validateSessionsSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/$projectId/threads",
      params: { projectId: params.projectId },
      search,
      replace: true,
    });
  },
});
