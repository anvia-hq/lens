import type { EvaluationFacets, EvaluationRunFacets } from "@lens/contracts";
import type {
  EvaluationResultsSearch,
  EvaluationRunsSearch,
  ResolvedEvaluationResultsSearch,
  ResolvedEvaluationRunsSearch,
} from "../types";
import { formatEvaluationSource } from "./evaluation-source";
import { FacetFilterPanel, toggleValue } from "./facet-filter-panel";

export function EvaluationRunFilterPanel(props: {
  filters: ResolvedEvaluationRunsSearch;
  facets?: EvaluationRunFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<EvaluationRunsSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  const definitions = [
    ["status", "Status", "statuses"],
    ["suite", "Suite", "suites"],
    ["environment", "Environment", "environments"],
    ["release", "Release", "releases"],
  ] as const;
  const sections = definitions.map(([id, label, field]) => ({
    id,
    label,
    selected: props.filters[field] ?? [],
    options: props.facets?.[id] ?? [],
    onToggle: (value: string, selected: boolean) =>
      props.onChange({ [field]: toggleValue(props.filters[field] ?? [], value, selected) }),
  }));
  return (
    <FacetFilterPanel
      resetKey={props.filters.range}
      storageKey="evaluation-runs"
      sections={sections}
      loading={props.loading}
      error={props.error}
      activeCount={props.activeCount}
      onClear={props.onClear}
      onCollapse={props.onCollapse}
    />
  );
}

export function EvaluationResultFilterPanel(props: {
  filters: ResolvedEvaluationResultsSearch;
  facets?: EvaluationFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<EvaluationResultsSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  const definitions = [
    ["suite", "Suite", "suites"],
    ["metric", "Metric", "metrics"],
    ["outcome", "Outcome", "outcomes"],
    ["source", "Source", "sources"],
    ["environment", "Environment", "environments"],
    ["release", "Release", "releases"],
  ] as const;
  const sections = definitions.map(([id, label, field]) => ({
    id,
    label,
    selected: props.filters[field] ?? [],
    options: props.facets?.[id] ?? [],
    formatOption:
      id === "source" ? (value: string) => formatEvaluationSource(value, true) : undefined,
    onToggle: (value: string, selected: boolean) =>
      props.onChange({
        [field]: toggleValue(props.filters[field] ?? [], value, selected),
      } as Partial<EvaluationResultsSearch>),
  }));
  return (
    <FacetFilterPanel
      resetKey={props.filters.range}
      storageKey="evaluation-results"
      sections={sections}
      loading={props.loading}
      error={props.error}
      activeCount={props.activeCount}
      onClear={props.onClear}
      onCollapse={props.onCollapse}
    />
  );
}
