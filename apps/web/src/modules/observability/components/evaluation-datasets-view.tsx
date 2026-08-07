import type { EvaluationDatasetCase } from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { Input } from "@lens/ui/components/input";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Database, Flask } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FullPageMessage } from "../../../components/full-page-message";
import {
  type EvaluationDatasetsState,
  UNVERSIONED_DATASET,
} from "../hooks/use-evaluation-datasets";
import type { TracePayloadView } from "../types";
import { formatNumber, formatTimestamp, shortId } from "../utils/trace-detail";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";

export function EvaluationDatasetsView({ state }: { state: EvaluationDatasetsState }) {
  const [searchDraft, setSearchDraft] = useState(state.search.search ?? "");
  const [selectedCase, setSelectedCase] = useState<EvaluationDatasetCase>();
  const [payloadView, setPayloadView] = useState<TracePayloadView>("formatted");
  useEffect(() => setSearchDraft(state.search.search ?? ""), [state.search.search]);
  useEffect(() => setSelectedCase(state.detail.data?.cases[0]), [state.detail.data]);
  if (state.datasets.isLoading)
    return <FullPageMessage icon={<Database />} text="Loading evaluation datasets" contained />;
  if (state.datasets.error || !state.datasets.data)
    return <FullPageMessage icon={<Database />} text="Unable to load datasets" contained />;
  const page = state.datasets.data;
  const detail = state.detail.data;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-background px-4 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Datasets</h1>
        <p className="text-sm text-muted-foreground">
          Immutable evaluation case snapshots discovered from ingested runs.
        </p>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Dataset catalog</CardTitle>
              <form
                className="max-w-md"
                onSubmit={(event) => {
                  event.preventDefault();
                  state.setSearch({ search: searchDraft.trim() || undefined, page: 1 });
                }}
              >
                <Input
                  value={searchDraft}
                  placeholder="Search datasets"
                  aria-label="Search datasets"
                  onChange={(event) => setSearchDraft(event.target.value)}
                />
              </form>
            </CardHeader>
            {page.items.length ? (
              <Table>
                <TableHeader>
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
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() => state.setSearch({ dataset: item.name, version: undefined })}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        state.setSearch({ dataset: item.name, version: undefined });
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
              <CardContent className="text-sm text-muted-foreground">
                No named evaluation datasets have been ingested.
              </CardContent>
            )}
            <CardContent className="flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">
                Page {page.page} of {Math.max(1, page.pageCount)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page.page <= 1}
                  onClick={() => state.setSearch({ page: page.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page.page >= page.pageCount}
                  onClick={() => state.setSearch({ page: page.page + 1 })}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
          {state.search.dataset ? (
            state.detail.isLoading ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  Loading dataset details…
                </CardContent>
              </Card>
            ) : detail ? (
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{detail.name}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Canonical run {detail.selectedVersion.canonicalRunId ?? "not available"}
                      </p>
                    </div>
                    <Badge variant="outline">{detail.selectedVersion.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.versions.map((version) => (
                      <Button
                        key={version.version ?? UNVERSIONED_DATASET}
                        size="sm"
                        variant={
                          version.version === detail.selectedVersion.version ? "default" : "outline"
                        }
                        onClick={() =>
                          state.setSearch({
                            version: version.version ?? UNVERSIONED_DATASET,
                          })
                        }
                      >
                        {version.version ?? "Unversioned"}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <div className="grid border-t lg:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
                  <div className="border-b lg:border-r lg:border-b-0">
                    <Table>
                      <TableHeader>
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
                            onClick={() => setSelectedCase(item)}
                          >
                            <TableCell className="pl-4 font-medium">{item.caseId}</TableCell>
                            <TableCell>
                              {item.payload === null ? "Unavailable" : "Captured"}
                            </TableCell>
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
                          <h3 className="font-semibold">{selectedCase.caseId}</h3>
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
                <CardContent className="border-t pt-4">
                  <h3 className="mb-3 text-sm font-semibold">Runs</h3>
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
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  Dataset details were not found.
                </CardContent>
              </Card>
            )
          ) : null}
        </div>
      </ScrollArea>
    </main>
  );
}
