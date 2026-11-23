import type { EvaluationDatasetCase } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldLabel } from "@lens/ui/components/field";
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
import { ArrowLeft, Database, FlaskConical as Flask, Search } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorAlert } from "../../../components/error-alert";
import { FullPageMessage } from "../../../components/full-page-message";
import {
  type EvaluationDatasetsState,
  type ObservedDatasetDetailState,
  UNVERSIONED_DATASET,
} from "../hooks/use-evaluation-datasets";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { DatasetTabs } from "./dataset-tabs";
import { ManagedDatasetsView } from "./managed-datasets-view";
import { PayloadSection } from "./payload-section";

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
          <div className="grid flex-1 place-items-center p-6 text-base text-muted-foreground">
            No named evaluation datasets have been ingested.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-base">
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
                  tabIndex={page.page <= 1 ? -1 : undefined}
                  className={cn(page.page <= 1 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page.page <= 1) return;
                    state.setSearch({ page: page.page - 1 });
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page.page >= page.pageCount}
                  tabIndex={page.page >= page.pageCount ? -1 : undefined}
                  className={cn(page.page >= page.pageCount && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page.page >= page.pageCount) return;
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
  const [saveManagedOpen, setSaveManagedOpen] = useState(false);
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
              nativeButton={false}
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
            <Button size="sm" variant="outline" onClick={() => setSaveManagedOpen(true)}>
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
                    className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    tabIndex={0}
                    data-state={selectedCase?.caseId === item.caseId ? "selected" : undefined}
                    onClick={() => setSelectedCase(item)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedCase(item);
                    }}
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
                </div>
                <PayloadSection title="Input" value={selectedCase.payload.input} />
                <PayloadSection title="Expected" value={selectedCase.payload.expected ?? null} />
              </div>
            ) : (
              <p className="text-base text-muted-foreground">
                Payload capture was not enabled for this case.
              </p>
            )}
          </div>
        </div>
        <div className="border-t p-4">
          <h2 className="mb-3 text-base font-semibold">Runs</h2>
          <div className="flex flex-wrap gap-2">
            {detail.runs.map((run) => (
              <Button
                key={run.id}
                size="sm"
                variant="outline"
                nativeButton={false}
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
      <SaveAsManagedDialog
        open={saveManagedOpen}
        defaultName={detail.name}
        defaultVersion={detail.selectedVersion.version ?? "v1"}
        pending={state.importObserved.isPending}
        error={state.importObserved.error}
        onClose={() => setSaveManagedOpen(false)}
        onSave={({ name, version }) =>
          state.importObserved.mutate(
            {
              sourceName: detail.name,
              sourceVersion: detail.selectedVersion.version,
              name,
              version,
            },
            { onSuccess: () => setSaveManagedOpen(false) },
          )
        }
      />
    </main>
  );
}

function SaveAsManagedDialog(props: {
  open: boolean;
  defaultName: string;
  defaultVersion: string;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (input: { name: string; version: string }) => void;
}) {
  const [name, setName] = useState(props.defaultName);
  const [version, setVersion] = useState(props.defaultVersion);
  useEffect(() => {
    if (!props.open) return;
    setName(props.defaultName);
    setVersion(props.defaultVersion);
  }, [props.open, props.defaultName, props.defaultVersion]);
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as managed dataset</DialogTitle>
          <DialogDescription>
            Create an editable managed dataset draft from this observed dataset version.
          </DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <Field>
          <FieldLabel>Managed dataset name</FieldLabel>
          <Input
            aria-label="Managed dataset name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Draft version label</FieldLabel>
          <Input
            aria-label="Draft version label"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </Field>
        <DialogFooter showCloseButton>
          <Button
            disabled={!name.trim() || !version.trim() || props.pending}
            onClick={() => props.onSave({ name: name.trim(), version: version.trim() })}
          >
            Save as managed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
