import { createFileRoute } from "@tanstack/react-router";
import { TracesView } from "../../../modules/observability/components/traces-view";
import { useTraces } from "../../../modules/observability/hooks/use-traces";
import type { TracesSearch } from "../../../modules/observability/types";
import { validateTracesSearch as normalizeTracesSearch } from "../../../modules/observability/utils";
import { restoreSavedFilters } from "../../../modules/observability/utils/saved-filters";

export function validateTracesSearch(search: Record<string, unknown>): TracesSearch {
  return normalizeTracesSearch(search);
}

export const Route = createFileRoute("/$projectId/traces/")({
  validateSearch: validateTracesSearch,
  beforeLoad: restoreSavedFilters("traces", "/$projectId/traces"),
  component: TracesPage,
});

function TracesPage() {
  const state = useTraces();
  return <TracesView state={state} />;
}
