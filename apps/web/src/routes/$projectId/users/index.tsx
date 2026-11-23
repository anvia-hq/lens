import { createFileRoute } from "@tanstack/react-router";
import { UsersView } from "../../../modules/observability/components/users-view";
import { useUsers } from "../../../modules/observability/hooks/use-users";
import type { UsersSearch } from "../../../modules/observability/types";
import { validateUsersSearch as normalizeUsersSearch } from "../../../modules/observability/utils";
import { restoreSavedFilters } from "../../../modules/observability/utils/saved-filters";

export function validateUsersSearch(search: Record<string, unknown>): UsersSearch {
  return normalizeUsersSearch(search);
}

export const Route = createFileRoute("/$projectId/users/")({
  validateSearch: validateUsersSearch,
  beforeLoad: restoreSavedFilters("users", "/$projectId/users"),
  component: UsersPage,
});

function UsersPage() {
  return <UsersView state={useUsers()} />;
}
