import { createFileRoute } from "@tanstack/react-router";
import { RunsView } from "../../../modules/observability/components/runs-view";
import { useRuns } from "../../../modules/observability/hooks/use-runs";
import type { RunsSearch } from "../../../modules/observability/types";
import { validateRunsSearch as normalizeRunsSearch } from "../../../modules/observability/utils";

export function validateRunsSearch(search: Record<string, unknown>): RunsSearch {
  return normalizeRunsSearch(search);
}

export const Route = createFileRoute("/$projectId/runs/")({
  validateSearch: validateRunsSearch,
  component: RunsPage,
});

function RunsPage() {
  const state = useRuns();
  return <RunsView state={state} />;
}
