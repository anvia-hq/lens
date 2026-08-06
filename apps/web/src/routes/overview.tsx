import { OverviewView } from "../modules/observability/components/overview-view";
import { useOverview } from "../modules/observability/hooks/use-overview";
import type { OverviewSearch } from "../modules/observability/types";
import { validateOverviewSearch as normalizeOverviewSearch } from "../modules/observability/utils";

export function validateOverviewSearch(search: Record<string, unknown>): OverviewSearch {
  return normalizeOverviewSearch(search);
}

export function OverviewPage() {
  const state = useOverview();
  return <OverviewView state={state} />;
}
