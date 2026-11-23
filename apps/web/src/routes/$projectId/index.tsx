import { createFileRoute } from "@tanstack/react-router";
import { OverviewView } from "../../modules/observability/components/overview-view";
import { useOverview } from "../../modules/observability/hooks/use-overview";
import type { OverviewSearch } from "../../modules/observability/types";
import { validateOverviewSearch as normalizeOverviewSearch } from "../../modules/observability/utils";
import { restoreSavedFilters } from "../../modules/observability/utils/saved-filters";

export function validateOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return normalizeOverviewSearch(search);
}

export const Route = createFileRoute("/$projectId/")({
  validateSearch: validateOverviewSearch,
  beforeLoad: restoreSavedFilters("overview", "/$projectId/"),
  component: OverviewPage,
});

function OverviewPage() {
  const state = useOverview();
  return <OverviewView state={state} />;
}
