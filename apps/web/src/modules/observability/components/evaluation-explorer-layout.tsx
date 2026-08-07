import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import { SlidersHorizontal } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function EvaluationExplorerLayout(props: {
  activeFilterCount: number;
  filterPanel: ReactNode;
  filterPanelCollapsed: boolean;
  mobileFiltersOpen: boolean;
  table: ReactNode;
  onFilterPanelCollapsedChange: (collapsed: boolean) => void;
  onMobileFiltersOpenChange: (open: boolean) => void;
}) {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="hidden min-h-[620px] flex-1 overflow-hidden md:flex">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            key={props.filterPanelCollapsed ? "collapsed" : "expanded"}
            id="evaluation-filters"
            defaultSize={props.filterPanelCollapsed ? "40px" : "280px"}
            minSize={props.filterPanelCollapsed ? "40px" : "200px"}
            maxSize={props.filterPanelCollapsed ? "40px" : "420px"}
            disabled={props.filterPanelCollapsed}
          >
            {props.filterPanelCollapsed ? (
              <div className="flex h-full flex-col items-center border-r bg-muted/20 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Show filters"
                  onClick={() => props.onFilterPanelCollapsedChange(false)}
                >
                  <SlidersHorizontal />
                </Button>
                {props.activeFilterCount > 0 ? (
                  <Badge className="mt-2 px-1.5" variant="secondary">
                    {props.activeFilterCount}
                  </Badge>
                ) : null}
              </div>
            ) : (
              props.filterPanel
            )}
          </ResizablePanel>
          {!props.filterPanelCollapsed ? <ResizableHandle withHandle /> : null}
          <ResizablePanel id="evaluation-results" minSize="50%">
            {props.table}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className="overflow-hidden md:hidden">{props.table}</div>
      <Sheet open={props.mobileFiltersOpen} onOpenChange={props.onMobileFiltersOpenChange}>
        <SheetContent side="bottom" className="h-[85svh] gap-0 p-0">
          <SheetTitle className="sr-only">Evaluation filters</SheetTitle>
          {props.filterPanel}
        </SheetContent>
      </Sheet>
    </main>
  );
}
