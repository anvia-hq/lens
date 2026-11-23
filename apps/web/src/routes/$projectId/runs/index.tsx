import { createFileRoute } from "@tanstack/react-router";
import { RunsView } from "../../../modules/observability/components/runs-view";
import { useRuns } from "../../../modules/observability/hooks/use-runs";
import type { RunsSearch } from "../../../modules/observability/types";
import { validateRunsSearch as normalizeRunsSearch } from "../../../modules/observability/utils";
import { restoreSavedFilters } from "../../../modules/observability/utils/saved-filters";

export function validateRunsSearch(search: Record<string, unknown>): RunsSearch {
  return normalizeRunsSearch(search);
}

export const Route = createFileRoute("/$projectId/runs/")({
  validateSearch: validateRunsSearch,
  beforeLoad: restoreSavedFilters("runs", "/$projectId/runs"),
  component: RunsPage,
});

function RunsPage() {
  const state = useRuns();
  return <RunsView state={state} />;
}
