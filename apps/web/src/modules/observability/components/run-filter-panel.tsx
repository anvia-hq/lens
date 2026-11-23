import type { RunFacets } from "@lens/contracts";
import type { ResolvedRunsSearch, RunsSearch } from "../types";
import { runFacetSections } from "../utils/observability-view";
import { CommittedFilterInput } from "./committed-filter-input";
import { FacetFilterPanel, toggleValue } from "./facet-filter-panel";

export function RunFilterPanel(props: {
  filters: ResolvedRunsSearch;
  facets?: RunFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<RunsSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  const sections = runFacetSections.map((section) => {
    const selected = props.filters[section.field] ?? [];
    return {
      id: section.id,
      label: section.label,
      selected,
      options: props.facets?.[section.id] ?? [],
      onToggle: (value: string, checked: boolean) =>
        props.onChange({ [section.field]: toggleValue(selected, value, checked) }),
    };
  });
  return (
    <FacetFilterPanel
      resetKey={props.filters.range}
      storageKey="runs"
      sections={sections}
      defaultOpen={["observationKind", "status", "model"]}
      loading={props.loading}
      error={props.error}
      activeCount={props.activeCount}
      onClear={props.onClear}
      onCollapse={props.onCollapse}
    >
      <CommittedFilterInput
        label="Trace ID contains"
        value={props.filters.traceId}
        placeholder="Trace ID"
        onCommit={(traceId) => props.onChange({ traceId })}
      />
      <CommittedFilterInput
        label="User ID contains"
        value={props.filters.userId}
        placeholder="User ID"
        onCommit={(userId) => props.onChange({ userId })}
      />
      <CommittedFilterInput
        label="Thread ID contains"
        value={props.filters.sessionId}
        placeholder="Thread ID"
        onCommit={(sessionId) => props.onChange({ sessionId })}
      />
    </FacetFilterPanel>
  );
}
