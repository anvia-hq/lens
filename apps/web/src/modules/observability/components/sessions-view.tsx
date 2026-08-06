import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lens/ui/components/resizable";
import { Sheet, SheetContent, SheetTitle } from "@lens/ui/components/sheet";
import { Filter as SlidersHorizontal } from "@solar-icons/react";
import type { SessionsState } from "../hooks/use-sessions";
import { LiveBadge } from "./live-badge";
import { RangeSelector } from "./range-selector";
import { SessionExplorerTable } from "./session-explorer-table";
import { SessionFilterPanel } from "./session-filter-panel";

export function SessionsView({ state }: { state: SessionsState }) {
  const {
    activeFilterCount,
    clearFilters,
    facets,
    filterPanelCollapsed,
    filters,
    mobileFiltersOpen,
    refreshInterval,
    searchDraft,
    sessions,
    setFilterPanelCollapsed,
    setFilters,
    setMobileFiltersOpen,
    setRefreshInterval,
    setSearchDraft,
  } = state;
  const table = (
    <SessionExplorerTable
      filters={filters}
      searchDraft={searchDraft}
      onSearchChange={setSearchDraft}
      data={sessions.data}
      loading={sessions.isLoading}
      error={sessions.error}
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
    <SessionFilterPanel
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
            id="session-filters"
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
          <ResizablePanel id="session-results" minSize="50%">
            {table}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className="overflow-hidden md:hidden">{table}</div>
      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="h-[85svh] gap-0 p-0">
          <SheetTitle className="sr-only">Session filters</SheetTitle>
          {filterPanel}
        </SheetContent>
      </Sheet>
    </main>
  );
}
