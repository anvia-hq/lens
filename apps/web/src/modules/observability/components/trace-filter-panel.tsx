import type { TraceFacets } from "@lens/contracts";
import { SelectField } from "@lens/ui/components/select";
import type { ResolvedTracesSearch, TracesSearch } from "../types";
import { traceFacetSections } from "../utils/observability-view";
import { CommittedFilterInput } from "./committed-filter-input";
import { FacetFilterPanel, toggleValue } from "./facet-filter-panel";

export function TraceFilterPanel(props: {
  filters: ResolvedTracesSearch;
  facets?: TraceFacets;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onChange: (changes: Partial<TracesSearch>) => void;
  onClear: () => void;
  onCollapse: () => void;
}) {
  const sections = traceFacetSections.map((section) => {
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
      storageKey="traces"
      sections={sections}
      defaultOpen={["status", "environment"]}
      loading={props.loading}
      error={props.error}
      activeCount={props.activeCount}
      onClear={props.onClear}
      onCollapse={props.onCollapse}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        Review
        <SelectField
          className="w-full text-sm"
          value={props.filters.review ?? ""}
          onValueChange={(value) =>
            props.onChange({ review: (value || undefined) as TracesSearch["review"] })
          }
          options={[
            { value: "", label: "Any review" },
            { value: "unreviewed", label: "Unreviewed" },
            { value: "pass", label: "Pass" },
            { value: "fail", label: "Fail" },
          ]}
        />
      </label>
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
        label="Session ID contains"
        value={props.filters.sessionId}
        placeholder="Session ID"
        onCommit={(sessionId) => props.onChange({ sessionId })}
      />
    </FacetFilterPanel>
  );
}
