import type { EvaluationDatasetCase } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Input } from "@lens/ui/components/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@lens/ui/components/pagination";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { cn } from "@lens/ui/lib/utils";
import { ArrowLeft, Database, Flask, MagnifyingGlass as Search } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import { FullPageMessage } from "../../../components/full-page-message";
import {
  type EvaluationDatasetsState,
  type ObservedDatasetDetailState,
  UNVERSIONED_DATASET,
} from "../hooks/use-evaluation-datasets";
import type { TracePayloadView } from "../types";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { DatasetTabs } from "./dataset-tabs";
import { ManagedDatasetsView } from "./managed-datasets-view";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";

export function EvaluationDatasetsView({ state }: { state: EvaluationDatasetsState }) {
  const [searchDraft, setSearchDraft] = useState(state.search.search ?? "");
  useEffect(() => setSearchDraft(state.search.search ?? ""), [state.search.search]);
  if (state.search.tab !== "observed") return <ManagedDatasetsView state={state} />;
  if (state.datasets.isLoading)
    return <FullPageMessage icon={<Database />} text="Loading evaluation datasets" contained />;
  if (state.datasets.error || !state.datasets.data)
    return <FullPageMessage icon={<Database />} text="Unable to load datasets" contained />;
  const page = state.datasets.data;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 md:h-12 md:flex-nowrap md:py-0">
        <form
          className="relative h-8 min-w-52 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            state.setSearch({ search: searchDraft.trim() || undefined, page: 1 });
          }}
        >
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8"
            value={searchDraft}
            placeholder="Search datasets"
            aria-label="Search observed datasets"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </form>
        <DatasetTabs state={state} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
        {page.items.length ? (
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="pl-4">Dataset</TableHead>
                <TableHead>Latest version</TableHead>
                <TableHead>Versions</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead className="pr-4">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((item) => (
                <TableRow
                  key={item.name}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  tabIndex={0}
                  onClick={() => state.openObservedDataset(item.name)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    state.openObservedDataset(item.name);
                  }}
                >
                  <TableCell className="pl-4 font-medium">{item.name}</TableCell>
                  <TableCell>{item.latestVersion ?? "Unversioned"}</TableCell>
                  <TableCell>{formatNumber(item.versionCount)}</TableCell>
                  <TableCell>{formatNumber(item.runCount)}</TableCell>
                  <TableCell className="pr-4">{formatTimestamp(item.latestRunAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
            No named evaluation datasets have been ingested.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm">
        <span className="text-muted-foreground">{formatNumber(page.total)} datasets</span>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap">
            Page {page.page} of {Math.max(1, page.pageCount)}
          </span>
          <Pagination className="w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page.page <= 1}
                  className={cn(page.page <= 1 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    state.setSearch({ page: Math.max(1, page.page - 1) });
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page.page >= page.pageCount}
                  className={cn(page.page >= page.pageCount && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    state.setSearch({ page: page.page + 1 });
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </main>
  );
}

export function ObservedDatasetDetailView({ state }: { state: ObservedDatasetDetailState }) {
  const [selectedCase, setSelectedCase] = useState<EvaluationDatasetCase>();
  const [payloadView, setPayloadView] = useState<TracePayloadView>("formatted");
  useEffect(() => setSelectedCase(state.detail.data?.cases[0]), [state.detail.data]);
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Database />} text="Loading dataset" contained />;
  if (state.detail.error || !state.detail.data)
    return <FullPageMessage icon={<Database />} text="Dataset not found" contained />;
  const detail = state.detail.data;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              render={
                <Link
                  to="/$projectId/evaluations/datasets"
                  params={{ projectId: state.project.id }}
                  search={{ tab: "observed", page: 1 }}
                />
              }
            >
              <ArrowLeft />
              <span className="sr-only">Back to datasets</span>
            </Button>
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{detail.name}</h1>
                <Badge variant="outline">{detail.selectedVersion.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Canonical run {detail.selectedVersion.canonicalRunId ?? "not available"}
              </p>
            </div>
          </div>
          {detail.selectedVersion.status === "complete" &&
          (state.project.role === "owner" || state.project.role === "admin") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = window.prompt("Managed dataset name", detail.name)?.trim();
                if (!name) return;
                const suggested = detail.selectedVersion.version ?? "v1";
                const version = window.prompt("Draft version label", suggested)?.trim();
                if (!version) return;
                state.importObserved.mutate({
                  sourceName: detail.name,
                  sourceVersion: detail.selectedVersion.version,
                  name,
                  version,
                });
              }}
            >
              Save as managed
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 pl-10">
          {detail.versions.map((version) => (
            <Button
              key={version.version ?? UNVERSIONED_DATASET}
              size="sm"
              variant={version.version === detail.selectedVersion.version ? "default" : "outline"}
              onClick={() => state.setVersion(version.version ?? UNVERSIONED_DATASET)}
            >
              {version.version ?? "Unversioned"}
            </Button>
          ))}
        </div>
      </header>
      {state.importObserved.error ? (
        <div className="border-b p-4">
          <ErrorAlert error={state.importObserved.error} />
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid min-h-full lg:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
          <div className="border-b lg:border-r lg:border-b-0">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="pl-4">Case</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead className="pr-4">State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.cases.map((item) => (
                  <TableRow
                    key={item.caseId}
                    className="cursor-pointer"
                    data-state={selectedCase?.caseId === item.caseId ? "selected" : undefined}
                    onClick={() => setSelectedCase(item)}
                  >
                    <TableCell className="pl-4 font-medium">{item.caseId}</TableCell>
                    <TableCell>{item.payload === null ? "Unavailable" : "Captured"}</TableCell>
                    <TableCell className="pr-4">
                      {item.conflict ? "Conflict" : "Canonical"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="min-w-0 p-4">
            {selectedCase?.payload ? (
              <div className="grid gap-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{selectedCase.caseId}</h2>
                  <PayloadViewSwitch value={payloadView} onChange={setPayloadView} />
                </div>
                <PayloadSection
                  title="Input"
                  value={selectedCase.payload.input}
                  view={payloadView}
                />
                <PayloadSection
                  title="Expected"
                  value={selectedCase.payload.expected ?? null}
                  view={payloadView}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Payload capture was not enabled for this case.
              </p>
            )}
          </div>
        </div>
        <div className="border-t p-4">
          <h2 className="mb-3 text-sm font-semibold">Runs</h2>
          <div className="flex flex-wrap gap-2">
            {detail.runs.map((run) => (
              <Button
                key={run.id}
                size="sm"
                variant="outline"
                render={
                  <Link
                    to="/$projectId/evaluations/runs/$runId"
                    params={{ projectId: state.project.id, runId: run.id }}
                    search={{}}
                  />
                }
              >
                <Flask /> {shortId(run.id)}
              </Button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
