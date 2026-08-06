import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import { SlidersHorizontal } from "@phosphor-icons/react";
import type { TracesState } from "../hooks/use-traces";
import { LiveBadge } from "./live-badge";
import { RangeSelector } from "./range-selector";
import { TraceExplorerTable } from "./trace-explorer-table";
import { TraceFilterPanel } from "./trace-filter-panel";

export function TracesView({ state }: { state: TracesState }) {
  const {
    activeFilterCount,
    clearFilters,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    refreshInterval,
    searchDraft,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setRefreshInterval,
    setSearchDraft,
    traces,
  } = state;
  const table = (
    <TraceExplorerTable
      filters={filters}
      searchDraft={searchDraft}
      onSearchChange={setSearchDraft}
      data={traces.data}
      loading={traces.isLoading}
      error={traces.error}
      activeFilterCount={activeFilterCount}
      onOpenMobileFilters={() => setMobileFiltersOpen(true)}
      onChange={(changes, resetPage) => setFilters(changes, resetPage)}
      actions={
        <>
          <RangeSelector value={filters.range} onChange={(value) => setFilters({ range: value })} />
          <LiveBadge interval={refreshInterval} onIntervalChange={setRefreshInterval} />
        </>
      }
    />
  );
  const filterPanel = (
    <TraceFilterPanel
      filters={filters}
      facets={facets.data}
      loading={facets.isLoading}
      error={facets.error}
      activeCount={activeFilterCount}
      onChange={(changes) => setFilters(changes)}
      onClear={clearFilters}
      onCollapse={() => setFilterPanelCollapsed(true)}
    />
  );
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="hidden min-h-[620px] flex-1 overflow-hidden md:flex">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            key={filterPanelCollapsed ? "collapsed" : "expanded"}
            id="trace-filters"
            defaultSize={filterPanelCollapsed ? "40px" : "280px"}
            minSize={filterPanelCollapsed ? "40px" : "200px"}
            maxSize={filterPanelCollapsed ? "40px" : "420px"}
            disabled={filterPanelCollapsed}
          >
            {filterPanelCollapsed ? (
              <div className="flex h-full flex-col items-center border-r bg-muted/20 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Show filters"
                  onClick={() => setFilterPanelCollapsed(false)}
                >
                  <SlidersHorizontal />
                </Button>
                {activeFilterCount > 0 ? (
                  <Badge className="mt-2 px-1.5" variant="secondary">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </div>
            ) : (
              filterPanel
            )}
          </ResizablePanel>
          {!filterPanelCollapsed ? <ResizableHandle withHandle /> : null}
          <ResizablePanel id="trace-results" minSize="50%">
            {table}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className="overflow-hidden md:hidden">{table}</div>
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="h-[85svh] gap-0 p-0">
          <SheetTitle className="sr-only">Trace filters</SheetTitle>
          {filterPanel}
        </SheetContent>
      </Sheet>
    </main>
  );
}
