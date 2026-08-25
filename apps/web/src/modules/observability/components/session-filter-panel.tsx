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
import { ArrowLeft } from "@phosphor-icons/react";
import { ErrorAlert } from "../../../components/error-alert";
import type { ResolvedSessionsSearch, SessionsSearch } from "../types";
import { formatNumber, sessionFacetSections } from "../utils/observability-view";

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
        <div>
          {props.error ? (
            <div className="mx-3 mt-3">
              <ErrorAlert error={props.error} />
            </div>
          ) : null}
          <Accordion multiple defaultValue={["status", "user", "environment"]}>
            {sessionFacetSections.map((section) => {
              const selected = props.filters[section.field] ?? [];
              const options = props.facets?.[section.id] ?? [];
              return (
                <AccordionItem key={section.id} value={section.id}>
                  <AccordionTrigger className="px-3">
                    <span className="flex items-center gap-2">
                      {section.label}
                      {selected.length > 0 ? (
                        <Badge variant="secondary">{selected.length}</Badge>
                      ) : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3">
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
                            className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-control-hover"
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
        </div>
      </ScrollArea>
    </div>
  );
}
