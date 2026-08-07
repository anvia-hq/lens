import type { EvaluationFacets, EvaluationRunFacets, TraceFacetValue } from "@lens/contracts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@lens/ui/components/accordion";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Checkbox } from "@lens/ui/components/checkbox";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import { Skeleton } from "@lens/ui/components/skeleton";
import { ArrowLeft } from "@phosphor-icons/react";
import { ErrorAlert } from "../../../components/error-alert";
import type {
  EvaluationResultsSearch,
  EvaluationRunsSearch,
  ResolvedEvaluationResultsSearch,
  ResolvedEvaluationRunsSearch,
} from "../types";
import { formatNumber } from "../utils/observability-view";

type FacetSection = {
  id: string;
  label: string;
  selected: string[];
  options: TraceFacetValue[];
  onToggle: (value: string, selected: boolean) => void;
};

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
    onToggle: (value: string, selected: boolean) => {
      const current = props.filters[field] ?? [];
      props.onChange({
        [field]: selected
          ? Array.from(new Set([...current, value]))
          : current.filter((item) => item !== value),
      });
    },
  }));
  return <FacetFilterPanel {...props} sections={sections} />;
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
    ["environment", "Environment", "environments"],
    ["release", "Release", "releases"],
  ] as const;
  const sections = definitions.map(([id, label, field]) => ({
    id,
    label,
    selected: props.filters[field] ?? [],
    options: props.facets?.[id] ?? [],
    onToggle: (value: string, selected: boolean) => {
      const current = props.filters[field] ?? [];
      props.onChange({
        [field]: selected
          ? Array.from(new Set([...current, value]))
          : current.filter((item) => item !== value),
      } as Partial<EvaluationResultsSearch>);
    },
  }));
  return <FacetFilterPanel {...props} sections={sections} />;
}

function FacetFilterPanel(props: {
  sections: FacetSection[];
  loading: boolean;
  error: unknown;
  activeCount: number;
  onClear: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">Filters</span>
          {props.activeCount > 0 ? <Badge variant="secondary">{props.activeCount}</Badge> : null}
        </div>
        <div className="flex items-center gap-1">
          {props.activeCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={props.onClear}>
              Clear all
            </Button>
          ) : null}
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon-sm"
            aria-label="Hide filters"
            onClick={props.onCollapse}
          >
            <ArrowLeft />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {props.error ? (
          <div className="mx-3 mt-3">
            <ErrorAlert error={props.error} />
          </div>
        ) : null}
        <Accordion multiple defaultValue={props.sections.slice(0, 3).map((section) => section.id)}>
          {props.sections.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="px-3">
                <span className="flex items-center gap-2">
                  {section.label}
                  {section.selected.length > 0 ? (
                    <Badge variant="secondary">{section.selected.length}</Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3">
                {props.loading ? (
                  <div className="grid gap-2 py-1">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                  </div>
                ) : section.options.length === 0 ? (
                  <p className="py-1 text-xs text-muted-foreground">No values in this range.</p>
                ) : (
                  <div className="grid gap-1">
                    {section.options.map((option) => (
                      <label
                        key={option.value}
                        htmlFor={`evaluation-facet-${section.id}-${option.value}`}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          id={`evaluation-facet-${section.id}-${option.value}`}
                          checked={section.selected.includes(option.value)}
                          onCheckedChange={(checked) => section.onToggle(option.value, checked)}
                        />
                        <span className="min-w-0 flex-1 truncate" title={option.value}>
                          {option.value}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatNumber(option.count)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
    </div>
  );
}
