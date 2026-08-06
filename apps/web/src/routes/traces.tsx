import { TracesView } from "../modules/observability/components/traces-view";
import { useTraces } from "../modules/observability/hooks/use-traces";
import type { TracesSearch } from "../modules/observability/types";
import { validateTracesSearch as normalizeTracesSearch } from "../modules/observability/utils";

export function validateTracesSearch(search: Record<string, unknown>): TracesSearch {
  return normalizeTracesSearch(search);
}

export function TracesPage() {
  const state = useTraces();
  return <TracesView state={state} />;
}
