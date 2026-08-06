import { createFileRoute } from "@tanstack/react-router";
import { UserDetailView } from "../../../modules/observability/components/user-detail-view";
import { useUserDetail } from "../../../modules/observability/hooks/use-user-detail";
import type { UserDetailSearch } from "../../../modules/observability/types";
import { validateUserDetailSearch as normalizeUserDetailSearch } from "../../../modules/observability/utils";

export function validateUserDetailSearch(search: Record<string, unknown>): UserDetailSearch {
  return normalizeUserDetailSearch(search);
}

export const Route = createFileRoute("/$projectId/users/$userId")({
  validateSearch: validateUserDetailSearch,
  component: UserDetailPage,
});

function UserDetailPage() {
  return <UserDetailView state={useUserDetail()} />;
}
