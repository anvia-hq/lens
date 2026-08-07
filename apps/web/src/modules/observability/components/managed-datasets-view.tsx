import {
  type ManagedDatasetCaseInput,
  type ManagedDatasetInput,
  type ManagedDatasetVersionDetail,
  managedDatasetCaseImportSchema,
  managedDatasetCaseInputSchema,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
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
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Textarea } from "@lens/ui/components/textarea";
import { Archive, Database, Flask, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { FullPageMessage } from "../../../components/full-page-message";
import type { EvaluationDatasetsState } from "../hooks/use-evaluation-datasets";
import { formatTimestamp, shortId } from "../utils/trace-detail";
import { DatasetTabs } from "./dataset-tabs";

export function ManagedDatasetsView({ state }: { state: EvaluationDatasetsState }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [caseItem, setCaseItem] = useState<ManagedDatasetCaseInput | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  if (state.managed.isLoading)
    return <FullPageMessage icon={<Database />} text="Loading managed datasets" contained />;
  if (state.managed.error || !state.managed.data)
    return <FullPageMessage icon={<Database />} text="Unable to load managed datasets" contained />;
  const selected = state.managedDetail.data;
  const version = state.managedVersion.data;
  const error =
    state.createDataset.error ??
    state.createVersion.error ??
    state.upsertCase.error ??
    state.importCases.error ??
    state.deleteCase.error ??
    state.publishVersion.error ??
    state.archiveDataset.error;
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Datasets</h1>
          <p className="text-sm text-muted-foreground">
            Author versioned evaluation cases and fetch published snapshots from your application.
          </p>
        </div>
        <DatasetTabs state={state} />
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {error ? <ErrorAlert error={error} /> : null}
          <div className="flex justify-end">
            {canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Create dataset
              </Button>
            ) : null}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Managed datasets</CardTitle>
            </CardHeader>
            {state.managed.data.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Dataset</TableHead>
                    <TableHead>Draft</TableHead>
                    <TableHead>Latest published</TableHead>
                    <TableHead>Versions</TableHead>
                    <TableHead className="pr-4">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.managed.data.items.map((dataset) => (
                    <TableRow
                      key={dataset.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() =>
                        state.setSearch({
                          managedDataset: dataset.id,
                          managedVersion: dataset.draft?.id ?? dataset.latestPublished?.id,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        state.setSearch({
                          managedDataset: dataset.id,
                          managedVersion: dataset.draft?.id ?? dataset.latestPublished?.id,
                        });
                      }}
                    >
                      <TableCell className="pl-4 font-medium">{dataset.name}</TableCell>
                      <TableCell>{dataset.draft?.version ?? "—"}</TableCell>
                      <TableCell>{dataset.latestPublished?.version ?? "—"}</TableCell>
                      <TableCell>{dataset.versionCount}</TableCell>
                      <TableCell className="pr-4">{formatTimestamp(dataset.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <CardContent>
                <EmptyState
                  icon={<Database />}
                  title="No managed datasets"
                  text="Create a dataset, add evaluation cases, and publish an immutable version."
                />
              </CardContent>
            )}
          </Card>
          {state.search.managedDataset ? (
            state.managedDetail.isLoading ? (
              <Card>
                <CardContent className="py-8">Loading dataset…</CardContent>
              </Card>
            ) : selected ? (
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{selected.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.description ?? "No description"}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {!selected.draft && selected.latestPublished ? (
                          <Button size="sm" variant="outline" onClick={() => setVersionOpen(true)}>
                            <Plus /> New version
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (window.confirm(`Archive ${selected.name}?`)) {
                              state.archiveDataset.mutate(selected.id);
                            }
                          }}
                        >
                          <Archive /> Archive
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.versions.map((item) => (
                      <Button
                        key={item.id}
                        size="sm"
                        variant={item.id === state.selectedVersionId ? "default" : "outline"}
                        onClick={() => state.setSearch({ managedVersion: item.id })}
                      >
                        {item.version} · {item.status}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                {state.managedVersion.isLoading ? (
                  <CardContent className="border-t py-8">Loading version…</CardContent>
                ) : version ? (
                  <ManagedVersion
                    state={state}
                    version={version}
                    canManage={canManage}
                    onAdd={() => setCaseItem("new")}
                    onEdit={setCaseItem}
                    onImport={() => setImportOpen(true)}
                  />
                ) : null}
              </Card>
            ) : null
          ) : null}
        </div>
      </ScrollArea>
      <CreateDatasetDialog
        open={createOpen}
        error={state.createDataset.error}
        onClose={() => setCreateOpen(false)}
        onSave={(input) =>
          state.createDataset.mutate(input, { onSuccess: () => setCreateOpen(false) })
        }
      />
      <VersionDialog
        open={versionOpen}
        suggestion={suggestNextVersion(selected?.latestPublished?.version)}
        onClose={() => setVersionOpen(false)}
        onSave={(versionLabel) => {
          if (!selected) return;
          state.createVersion.mutate(
            { datasetId: selected.id, version: versionLabel },
            { onSuccess: () => setVersionOpen(false) },
          );
        }}
      />
      <CaseDialog
        item={caseItem}
        onClose={() => setCaseItem(null)}
        onSave={(item) => {
          if (!version) return;
          state.upsertCase.mutate(
            { datasetId: version.datasetId, versionId: version.id, item },
            { onSuccess: () => setCaseItem(null) },
          );
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSave={(items) => {
          if (!version) return;
          state.importCases.mutate(
            { datasetId: version.datasetId, versionId: version.id, items },
            { onSuccess: () => setImportOpen(false) },
          );
        }}
      />
    </main>
  );
}

function ManagedVersion(props: {
  state: EvaluationDatasetsState;
  version: ManagedDatasetVersionDetail;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (item: ManagedDatasetCaseInput) => void;
  onImport: () => void;
}) {
  const { state, version } = props;
  const editable = props.canManage && version.status === "draft";
  return (
    <>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{version.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {version.caseCount} cases
            {version.publishedAt ? ` · published ${formatTimestamp(version.publishedAt)}` : ""}
          </span>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={props.onImport}>
              <UploadSimple /> Import JSONL
            </Button>
            <Button size="sm" variant="outline" onClick={props.onAdd}>
              <Plus /> Add case
            </Button>
            <Button
              size="sm"
              disabled={version.items.length === 0}
              onClick={() => {
                if (window.confirm(`Publish ${version.version}? It will become immutable.`)) {
                  state.publishVersion.mutate({
                    datasetId: version.datasetId,
                    versionId: version.id,
                  });
                }
              }}
            >
              Publish version
            </Button>
          </div>
        ) : null}
      </CardContent>
      {version.items.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Case</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Expected</TableHead>
              {editable ? <TableHead className="pr-4 text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {version.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="pl-4 font-medium">{item.id}</TableCell>
                <TableCell className="max-w-sm truncate">{compactJson(item.input)}</TableCell>
                <TableCell className="max-w-sm truncate">
                  {item.expected === undefined ? "—" : compactJson(item.expected)}
                </TableCell>
                {editable ? (
                  <TableCell className="pr-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => props.onEdit(item)}>
                      Edit
                    </Button>
                    <Button
                      aria-label={`Delete ${item.id}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        state.deleteCase.mutate({
                          datasetId: version.datasetId,
                          versionId: version.id,
                          caseId: item.id,
                        })
                      }
                    >
                      <Trash />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <CardContent className="border-t py-8 text-sm text-muted-foreground">
          This draft has no cases yet.
        </CardContent>
      )}
      {state.linkedRuns.data?.runs.length ? (
        <CardContent className="border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold">Associated runs</h3>
          <div className="flex flex-wrap gap-2">
            {state.linkedRuns.data.runs.map((run) => (
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
      ) : null}
    </>
  );
}

function CreateDatasetDialog(props: {
  open: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (input: ManagedDatasetInput) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
  }, [props.open]);
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create dataset</DialogTitle>
          <DialogDescription>Lens will create an editable v1 draft.</DialogDescription>
        </DialogHeader>
        {props.error ? <ErrorAlert error={props.error} /> : null}
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <DialogFooter showCloseButton>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              props.onSave({
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
              })
            }
          >
            Create dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionDialog(props: {
  open: boolean;
  suggestion: string;
  onClose: () => void;
  onSave: (version: string) => void;
}) {
  const [version, setVersion] = useState(props.suggestion);
  useEffect(() => setVersion(props.suggestion), [props.suggestion]);
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new version</DialogTitle>
          <DialogDescription>
            The latest published cases will be copied into a draft.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Version label</FieldLabel>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} />
        </Field>
        <DialogFooter showCloseButton>
          <Button disabled={!version.trim()} onClick={() => props.onSave(version.trim())}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CaseDialog(props: {
  item: ManagedDatasetCaseInput | "new" | null;
  onClose: () => void;
  onSave: (item: ManagedDatasetCaseInput) => void;
}) {
  const [value, setValue] = useState(caseForm());
  const [error, setError] = useState<string>();
  useEffect(() => {
    setValue(caseForm(props.item && props.item !== "new" ? props.item : undefined));
    setError(undefined);
  }, [props.item]);
  const save = () => {
    try {
      const candidate: Record<string, unknown> = {
        id: value.id,
        input: JSON.parse(value.input),
      };
      if (value.expected.trim()) candidate.expected = JSON.parse(value.expected);
      if (value.context.trim()) candidate.context = JSON.parse(value.context);
      if (value.retrievalContext.trim())
        candidate.retrievalContext = JSON.parse(value.retrievalContext);
      if (value.metadata.trim()) candidate.metadata = JSON.parse(value.metadata);
      const parsed = managedDatasetCaseInputSchema.safeParse(candidate);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid case");
      props.onSave(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON");
    }
  };
  return (
    <Dialog open={props.item !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{props.item === "new" ? "Add case" : "Edit case"}</DialogTitle>
          <DialogDescription>Inputs and expected values may be any JSON value.</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto p-1 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel>Case ID</FieldLabel>
            <Input
              value={value.id}
              disabled={props.item !== "new"}
              onChange={(e) => setValue({ ...value, id: e.target.value })}
            />
          </Field>
          <JsonField
            label="Input"
            value={value.input}
            onChange={(input) => setValue({ ...value, input })}
          />
          <JsonField
            label="Expected (optional)"
            value={value.expected}
            onChange={(expected) => setValue({ ...value, expected })}
          />
          <JsonField
            label="Context string[]"
            value={value.context}
            onChange={(context) => setValue({ ...value, context })}
          />
          <JsonField
            label="Retrieval context string[]"
            value={value.retrievalContext}
            onChange={(retrievalContext) => setValue({ ...value, retrievalContext })}
          />
          <Field className="sm:col-span-2">
            <FieldLabel>Metadata object</FieldLabel>
            <Textarea
              rows={4}
              value={value.metadata}
              onChange={(e) => setValue({ ...value, metadata: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter showCloseButton>
          <Button disabled={!value.id.trim() || !value.input.trim()} onClick={save}>
            Save case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog(props: {
  open: boolean;
  onClose: () => void;
  onSave: (items: ManagedDatasetCaseInput[]) => void;
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (props.open) {
      setSource("");
      setError(undefined);
    }
  }, [props.open]);
  const save = () => {
    try {
      const items = source
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      const parsed = managedDatasetCaseImportSchema.safeParse({ items });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid JSONL");
      props.onSave(parsed.data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSONL");
    }
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import JSONL</DialogTitle>
          <DialogDescription>
            One case object per line. Existing case IDs are updated atomically.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Textarea
          className="min-h-72 font-mono text-xs"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={'{"id":"refund","input":"Can I get a refund?","expected":"30 days"}'}
        />
        <DialogFooter showCloseButton>
          <Button disabled={!source.trim()} onClick={save}>
            Import cases
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JsonField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Textarea rows={6} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </Field>
  );
}

function caseForm(item?: ManagedDatasetCaseInput) {
  return {
    id: item?.id ?? "",
    input: item === undefined ? '""' : JSON.stringify(item.input, null, 2),
    expected: item?.expected === undefined ? "" : JSON.stringify(item.expected, null, 2),
    context: item?.context === undefined ? "" : JSON.stringify(item.context, null, 2),
    retrievalContext:
      item?.retrievalContext === undefined ? "" : JSON.stringify(item.retrievalContext, null, 2),
    metadata: item?.metadata === undefined ? "{}" : JSON.stringify(item.metadata, null, 2),
  };
}

function compactJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 100 ? `${text.slice(0, 97)}…` : text;
}

function suggestNextVersion(version: string | undefined): string {
  const match = /^v(\d+)$/i.exec(version ?? "");
  return match ? `v${Number(match[1]) + 1}` : "v2";
}
