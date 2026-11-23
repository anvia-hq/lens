import type { SessionFacets } from "@lens/contracts";
import type { ResolvedSessionsSearch, SessionsSearch } from "../types";
import { sessionFacetSections } from "../utils/observability-view";
import { FacetFilterPanel, toggleValue } from "./facet-filter-panel";

export function SessionFilterPanel(props: {
  filters: ResolvedSessionsSearch;
  facets?: SessionFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<SessionsSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  const sections = sessionFacetSections.map((section) => {
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
      storageKey="sessions"
      sections={sections}
      defaultOpen={["status", "user", "environment"]}
      loading={props.loading}
      error={props.error}
      activeCount={props.activeCount}
      onClear={props.onClear}
      onCollapse={props.onCollapse}
    />
  );
}
