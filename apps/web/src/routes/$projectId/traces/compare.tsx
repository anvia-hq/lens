import { createFileRoute } from "@tanstack/react-router";
import { TraceCompareView } from "../../../modules/observability/components/trace-compare-view";
import { useTraceCompare } from "../../../modules/observability/hooks/use-trace-compare";
import type { TraceCompareSearch } from "../../../modules/observability/types";
import { validateTraceCompareSearch as normalizeTraceCompareSearch } from "../../../modules/observability/utils";

export function validateTraceCompareSearch(search: Record<string, unknown>): TraceCompareSearch {
  return normalizeTraceCompareSearch(search);
}

export const Route = createFileRoute("/$projectId/traces/compare")({
  validateSearch: validateTraceCompareSearch,
  component: TraceComparePage,
});

function TraceComparePage() {
  const state = useTraceCompare();
  return <TraceCompareView state={state} />;
}
