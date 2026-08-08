import type { CostRecalculation, LlmModel } from "@lens/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lens/ui/components/alert-dialog";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Calendar } from "@lens/ui/components/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lens/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import { Spinner } from "@lens/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Calculator, Pencil, Plus, Trash as Trash2 } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { Page } from "../../../components/page";
import type { LlmModelsState, ModelPriceInput } from "../hooks/use-llm-models";

type DateSelection = { from: Date | undefined; to?: Date };

export function LlmModelsView({ state }: { state: LlmModelsState }) {
  const [editing, setEditing] = useState<LlmModel | "new" | null>(null);
  const [deleting, setDeleting] = useState<LlmModel | null>(null);
  const [recalculateOpen, setRecalculateOpen] = useState(false);
  const items = state.models.data?.items ?? [];
  const error =
    state.models.error ??
    state.recalculations.error ??
    state.createPrice.error ??
    state.updatePrice.error ??
    state.deletePrice.error ??
    state.recalculate.error;
  return (
    <Page
      className="mx-auto max-w-6xl"
      eyebrow="Anvia Lens"
      title="Cost Settings"
      description="Configure organization-wide USD pricing per million tokens."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={
              items.every((item) => item.id === null) ||
              state.recalculations.data?.hasActiveRecalculation === true
            }
            onClick={() => setRecalculateOpen(true)}
          >
            <Calculator /> Recalculate
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> Add model
          </Button>
        </div>
      }
    >
      {error ? <ErrorAlert error={error} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Model pricing</CardTitle>
          <CardDescription>
            Configured prices override costs reported by telemetry for matching model names.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {state.models.isLoading ? (
            <div className="grid min-h-36 place-items-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Calculator />}
              title="No models found"
              text="Add a model now or ingest telemetry to discover model names automatically."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Input / 1M</TableHead>
                  <TableHead>Cached input / 1M</TableHead>
                  <TableHead>Output / 1M</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.model}>
                    <TableCell className="font-mono font-medium">{item.model}</TableCell>
                    <TableCell>{formatRate(item.inputPricePerMillion)}</TableCell>
                    <TableCell>
                      {item.id !== null && item.cachedInputPricePerMillion === null
                        ? "Uses input rate"
                        : formatRate(item.cachedInputPricePerMillion)}
                    </TableCell>
                    <TableCell>{formatRate(item.outputPricePerMillion)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Badge variant={item.id === null ? "outline" : "secondary"}>
                          {item.id === null ? "Unconfigured" : "Configured"}
                        </Badge>
                        {item.observed ? <Badge variant="outline">Observed</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${item.id === null ? "Configure" : "Edit"} ${item.model}`}
                          onClick={() => setEditing(item)}
                        >
                          <Pencil />
                        </Button>
                        {item.id ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${item.model} pricing`}
                            onClick={() => setDeleting(item)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecalculationHistory runs={state.recalculations.data?.recalculations ?? []} />
      <PriceDialog
        item={editing}
        pending={state.createPrice.isPending || state.updatePrice.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            state.createPrice.reset();
            state.updatePrice.reset();
          }
        }}
        onSubmit={(input) => {
          if (editing !== null && editing !== "new" && editing.id !== null) {
            state.updatePrice.mutate(
              { ...input, id: editing.id },
              { onSuccess: () => setEditing(null) },
            );
          } else {
            state.createPrice.mutate(input, { onSuccess: () => setEditing(null) });
          }
        }}
      />
      <RecalculationDialog
        open={recalculateOpen}
        pending={state.recalculate.isPending}
        onOpenChange={setRecalculateOpen}
        onSubmit={(range) =>
          state.recalculate.mutate(range, { onSuccess: () => setRecalculateOpen(false) })
        }
      />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this model price?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing historical costs stay unchanged. Future telemetry for this model will keep
              its reported cost until pricing is configured again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={state.deletePrice.isPending}
              onClick={() => {
                if (deleting?.id) {
                  state.deletePrice.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
                }
              }}
            >
              Remove price
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function PriceDialog(props: {
  item: LlmModel | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ModelPriceInput) => void;
}) {
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [cached, setCached] = useState("");
  const [output, setOutput] = useState("");
  useEffect(() => {
    if (props.item === null) return;
    setModel(props.item === "new" ? "" : props.item.model);
    setInput(props.item === "new" ? "" : String(props.item.inputPricePerMillion ?? ""));
    setCached(props.item === "new" ? "" : String(props.item.cachedInputPricePerMillion ?? ""));
    setOutput(props.item === "new" ? "" : String(props.item.outputPricePerMillion ?? ""));
  }, [props.item]);
  const configured = props.item !== null && props.item !== "new" && props.item.id !== null;
  const lockedModel = props.item !== null && props.item !== "new";
  return (
    <Dialog open={props.item !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{configured ? "Edit model price" : "Configure model price"}</DialogTitle>
          <DialogDescription>Prices are in USD per one million tokens.</DialogDescription>
        </DialogHeader>
        <form
          id="model-price-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit({
              model: model.trim(),
              inputPricePerMillion: Number(input),
              cachedInputPricePerMillion: cached.trim() === "" ? null : Number(cached),
              outputPricePerMillion: Number(output),
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="model-name">Model name</FieldLabel>
              <Input
                id="model-name"
                required
                autoFocus
                disabled={lockedModel}
                value={model}
                placeholder="gpt-5.2"
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <PriceField
                id="input-price"
                label="Input"
                value={input}
                onChange={setInput}
                required
              />
              <PriceField
                id="cached-price"
                label="Cached input"
                value={cached}
                onChange={setCached}
              />
              <PriceField
                id="output-price"
                label="Output"
                value={output}
                onChange={setOutput}
                required
              />
            </div>
          </FieldGroup>
        </form>
        <DialogFooter showCloseButton>
          <Button form="model-price-form" type="submit" disabled={props.pending}>
            {props.pending ? <Spinner /> : null} Save price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceField(props: {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        type="number"
        min="0"
        step="any"
        required={props.required}
        value={props.value}
        placeholder={props.required ? "0.00" : "Uses input"}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </Field>
  );
}

function RecalculationDialog(props: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (range: { from?: string; to?: string }) => void;
}) {
  const [scope, setScope] = useState<"all" | "range">("all");
  const [range, setRange] = useState<DateSelection>({ from: undefined });
  const completeRange = range.from !== undefined && range.to !== undefined;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Recalculate model costs</DialogTitle>
          <DialogDescription>
            This queues a background worker job and overwrites reported costs for configured models.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recalculation-scope">Scope</FieldLabel>
            <NativeSelect
              id="recalculation-scope"
              className="w-full"
              value={scope}
              onChange={(event) => setScope(event.target.value as "all" | "range")}
            >
              <NativeSelectOption value="all">All history</NativeSelectOption>
              <NativeSelectOption value="range">Date range</NativeSelectOption>
            </NativeSelect>
          </Field>
          {scope === "range" ? (
            <Field>
              <FieldLabel>Date range</FieldLabel>
              <div className="w-fit rounded-lg border">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={(value) => setRange(value ?? { from: undefined })}
                  disabled={{ after: new Date() }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {completeRange
                  ? `${range.from?.toLocaleDateString()} – ${range.to?.toLocaleDateString()}`
                  : "Select a start and end date."}
              </p>
            </Field>
          ) : null}
        </FieldGroup>
        <DialogFooter showCloseButton>
          <Button
            disabled={props.pending || (scope === "range" && !completeRange)}
            onClick={() => {
              if (scope === "all") return props.onSubmit({});
              if (!range.from || !range.to) return;
              props.onSubmit({
                from: localDayStart(range.from).toISOString(),
                to: localDayAfter(range.to).toISOString(),
              });
            }}
          >
            {props.pending ? <Spinner /> : <Calculator />} Queue recalculation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecalculationHistory({ runs }: { runs: CostRecalculation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent recalculations</CardTitle>
        <CardDescription>The ten most recent background pricing runs.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {runs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No recalculations yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <RunBadge run={run} />
                  </TableCell>
                  <TableCell>{formatRunScope(run)}</TableCell>
                  <TableCell>{run.requestedBy.name}</TableCell>
                  <TableCell>
                    {run.status === "completed" ? (
                      `${run.affectedSpans ?? 0} spans · ${run.affectedTraces ?? 0} traces`
                    ) : run.status === "failed" ? (
                      <span className="text-destructive" title={run.error ?? undefined}>
                        {run.error ?? "Failed"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{new Date(run.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RunBadge({ run }: { run: CostRecalculation }) {
  return (
    <Badge
      variant={
        run.status === "failed"
          ? "destructive"
          : run.status === "completed"
            ? "secondary"
            : "outline"
      }
    >
      {run.status === "running" ? <Spinner className="size-3" /> : null}
      {run.status}
    </Badge>
  );
}

function formatRate(value: number | null): string {
  return value === null
    ? "—"
    : `$${value.toLocaleString(undefined, { maximumFractionDigits: 12 })}`;
}

function formatRunScope(run: CostRecalculation): string {
  if (run.from === null || run.to === null) return "All history";
  const inclusiveEnd = new Date(new Date(run.to).getTime() - 1);
  return `${new Date(run.from).toLocaleDateString()} – ${inclusiveEnd.toLocaleDateString()}`;
}

function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDayAfter(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
