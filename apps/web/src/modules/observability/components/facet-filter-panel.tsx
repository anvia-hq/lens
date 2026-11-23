import type { TraceFacetValue } from "@lens/contracts";
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
import { cn } from "@lens/ui/lib/utils";
import { ArrowLeft } from "@mynaui/icons-react";
import { type ReactNode, useRef } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import { isStringArray, useStoredState } from "../hooks/use-stored-state";
import { formatNumber } from "../utils/observability-view";

export type FacetSection = {
  id: string;
  label: string;
  selected: string[];
  options: TraceFacetValue[];
  formatOption?: ((value: string) => string) | undefined;
  onToggle: (value: string, selected: boolean) => void;
};

/** Toggle one value in a multi-select filter list. */
export function toggleValue(current: string[], value: string, selected: boolean) {
  return selected
    ? Array.from(new Set([...current, value]))
    : current.filter((item) => item !== value);
}

/**
 * Every filter change makes the server re-sort and narrow each section's values. Rows then move
 * or vanish, and because sections stack, everything below shifts. So remember each value the first
 * time it is seen (per section, until `resetKey` changes), keep it in that position, and keep
 * listing it with a count of 0 when the current filters exclude it.
 */
function useStableSections(sections: FacetSection[], resetKey: string | undefined) {
  const memory = useRef<{ key: string | undefined; seen: Map<string, Map<string, number>> }>({
    key: resetKey,
    seen: new Map(),
  });
  if (memory.current.key !== resetKey) memory.current = { key: resetKey, seen: new Map() };
  return sections.map((section) => {
    let seen = memory.current.seen.get(section.id);
    if (seen === undefined) {
      seen = new Map();
      memory.current.seen.set(section.id, seen);
    }
    const counts = new Map(section.options.map((option) => [option.value, option.count]));
    for (const value of [...counts.keys(), ...section.selected]) {
      if (!seen.has(value)) seen.set(value, seen.size);
    }
    const options = [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([value]) => ({ value, count: counts.get(value) ?? 0 }));
    return { ...section, options };
  });
}

/**
 * The one filters sidebar shared by Traces, Runs, Threads, Experiments and Results, so header,
 * facet rows, spacing, text size, scrolling and persisted open/closed state can't drift apart.
 * Page-specific filters (ID inputs, selects) go in `children`.
 */
export function FacetFilterPanel(props: {
  storageKey: string;
  sections: FacetSection[];
  defaultOpen?: string[];
  /** Changing this (for example the time range) forgets the remembered row order. */
  resetKey?: string;
  loading: boolean;
  error: unknown;
  activeCount: number;
  onClear: () => void;
  onCollapse: () => void;
  children?: ReactNode;
}) {
  const [openSections, setOpenSections] = useStoredState(
    `filter-sections:${props.storageKey}`,
    props.defaultOpen ?? props.sections.slice(0, 3).map((section) => section.id),
    isStringArray,
  );
  const sections = useStableSections(props.sections, props.resetKey);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-sm">
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
        <Accordion multiple value={openSections} onValueChange={setOpenSections}>
          {sections.map((section) => (
            <AccordionItem key={section.id} value={section.id}>
              <AccordionTrigger className="px-3 text-sm">
                <span className="flex h-5.5 items-center gap-2">
                  {section.label}
                  {section.selected.length > 0 ? (
                    <Badge variant="secondary">{section.selected.length}</Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3 text-sm">
                {props.loading ? (
                  <div className="grid gap-2 py-1">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                  </div>
                ) : section.options.length === 0 ? (
                  <p className="py-1 text-sm text-muted-foreground">No values in this range.</p>
                ) : (
                  <div className="grid gap-1">
                    {section.options.map((option) => {
                      const id = `facet-${props.storageKey}-${section.id}-${option.value}`;
                      return (
                        <label
                          key={option.value}
                          htmlFor={id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-control-hover",
                            option.count === 0 &&
                              !section.selected.includes(option.value) &&
                              "opacity-50",
                          )}
                        >
                          <Checkbox
                            id={id}
                            checked={section.selected.includes(option.value)}
                            onCheckedChange={(checked) => section.onToggle(option.value, checked)}
                          />
                          <span className="min-w-0 flex-1 truncate" title={option.value}>
                            {section.formatOption?.(option.value) ?? option.value}
                          </span>
                          <span className="font-mono text-sm text-muted-foreground">
                            {formatNumber(option.count)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {props.children ? (
          <div className="grid gap-4 border-t px-3 pb-5 pt-4">{props.children}</div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
