import type { SessionFacets } from "@lens/contracts";
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
import { ArrowLeft } from "@solar-icons/react";
import { ErrorAlert } from "../../../components/error-alert";
import type { ResolvedSessionsSearch, SessionsSearch } from "../types";
import { formatNumber, sessionFacetSections } from "../utils/observability-view";
import { TraceRangeFilter } from "./trace-range-filter";

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
        <div className="px-3 pb-5">
          {props.error ? <ErrorAlert error={props.error} /> : null}
          <Accordion multiple defaultValue={["status", "user", "environment"]}>
            {sessionFacetSections.map((section) => {
              const selected = props.filters[section.field] ?? [];
              const options = props.facets?.[section.id] ?? [];
              return (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      {section.label}
                      {selected.length > 0 ? (
                        <Badge variant="secondary">{selected.length}</Badge>
                      ) : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {props.loading ? (
                      <div className="grid gap-2 py-1">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-4/5" />
                      </div>
                    ) : options.length === 0 ? (
                      <p className="py-1 text-xs text-muted-foreground">No values in this range.</p>
                    ) : (
                      <div className="grid gap-1">
                        {options.map((option) => (
                          <label
                            key={option.value}
                            htmlFor={`session-facet-${section.id}-${option.value}`}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted"
                          >
                            <Checkbox
                              id={`session-facet-${section.id}-${option.value}`}
                              checked={selected.includes(option.value)}
                              onCheckedChange={(checked) =>
                                props.onChange({
                                  [section.field]: checked
                                    ? Array.from(new Set([...selected, option.value]))
                                    : selected.filter((value) => value !== option.value),
                                })
                              }
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
              );
            })}
          </Accordion>
          <div className="grid gap-4 border-t pt-4">
            <TraceRangeFilter
              label="Duration (ms)"
              minimum={props.filters.minDurationMs}
              maximum={props.filters.maxDurationMs}
              onCommit={(minDurationMs, maxDurationMs) =>
                props.onChange({ minDurationMs, maxDurationMs })
              }
            />
            <TraceRangeFilter
              label="Total tokens"
              minimum={props.filters.minTotalTokens}
              maximum={props.filters.maxTotalTokens}
              integer
              onCommit={(minTotalTokens, maxTotalTokens) =>
                props.onChange({ minTotalTokens, maxTotalTokens })
              }
            />
            <TraceRangeFilter
              label="Total cost (USD)"
              minimum={props.filters.minTotalCost}
              maximum={props.filters.maxTotalCost}
              step="0.0001"
              onCommit={(minTotalCost, maxTotalCost) =>
                props.onChange({ minTotalCost, maxTotalCost })
              }
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
