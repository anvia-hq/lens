import {
  type EvaluationResult,
  type ManagedDatasetCaseInput,
  type ManagedDatasetSummary,
  type ManagedDatasetVersionDetail,
  managedDatasetCaseInputSchema,
  type SpanDetail,
  type TraceDetail,
  type TraceReviewInput,
} from "@lens/contracts";
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
import { Textarea } from "@lens/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { notify } from "../../projects/utils";
import { buildSpanForest, traceReview, traceReviewDatasetCase } from "../utils/trace-detail";

export function TraceReviewPanel(props: {
  canManage: boolean;
  detail: TraceDetail;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const current = traceReview(props.detail);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [outcome, setOutcome] = useState<TraceReviewInput["outcome"]>("pass");
  const [explanation, setExplanation] = useState("");
  useEffect(() => {
    setOutcome(current?.outcome === "fail" ? "fail" : "pass");
    setExplanation(current?.explanation ?? "");
  }, [current]);
  const save = useMutation({
    mutationFn: (input: TraceReviewInput) =>
      api<EvaluationResult>(
        `/api/v1/projects/${props.projectId}/traces/${props.detail.summary.traceId}/review`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData<TraceDetail>(
        ["trace", props.projectId, props.detail.summary.traceId],
        (detail) =>
          detail
            ? {
                ...detail,
                evaluations: [
                  ...detail.evaluations.filter((evaluation) => evaluation.id !== result.id),
                  result,
                ],
              }
            : detail,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["traces", props.projectId] }),
        queryClient.invalidateQueries({ queryKey: ["evaluations", props.projectId] }),
        queryClient.invalidateQueries({ queryKey: ["evaluation-facets", props.projectId] }),
      ]);
      setReviewOpen(false);
      notify("Trace review saved");
    },
    onError: (error) => notify(error instanceof Error ? error.message : "Review failed", "error"),
  });

  return (
    <>
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2 text-sm">
        <span className="font-medium">Human review</span>
        {current ? (
          <>
            <Badge variant={current.outcome === "fail" ? "destructive" : "secondary"}>
              {current.outcome === "fail" ? "Fail" : "Pass"}
            </Badge>
            <span className="truncate text-muted-foreground">
              {current.reviewer?.name ?? "Unknown reviewer"}
              {current.explanation ? ` · ${current.explanation}` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Not reviewed</span>
        )}
        <Button className="ml-auto" size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
          {current ? "Edit review" : "Review trace"}
        </Button>
        {props.canManage && current?.outcome === "fail" ? (
          <PromoteTraceButton detail={props.detail} projectId={props.projectId} review={current} />
        ) : null}
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review trace</DialogTitle>
            <DialogDescription>
              This shared review replaces the previous review for this trace.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Outcome</FieldLabel>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={outcome === "pass" ? "default" : "outline"}
                onClick={() => setOutcome("pass")}
              >
                Pass
              </Button>
              <Button
                type="button"
                variant={outcome === "fail" ? "destructive" : "outline"}
                onClick={() => setOutcome("fail")}
              >
                Fail
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              maxLength={2_000}
              rows={5}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
          </Field>
          {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
          <DialogFooter showCloseButton>
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate({ outcome, explanation: explanation || undefined })}
            >
              {save.isPending ? "Saving…" : "Save review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromoteTraceButton(props: {
  detail: TraceDetail;
  projectId: string;
  review: EvaluationResult;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const root = useMemo(() => buildSpanForest(props.detail.spans)[0]?.span, [props.detail.spans]);
  const rootSpan = useQuery({
    queryKey: ["trace-span", props.projectId, props.detail.summary.traceId, root?.spanId],
    queryFn: ({ signal }) =>
      api<SpanDetail>(
        `/api/v1/projects/${props.projectId}/traces/${props.detail.summary.traceId}/spans/${root?.spanId}`,
        { signal },
      ),
    enabled: open && root !== undefined,
    staleTime: 5 * 60 * 1_000,
  });
  const original = useMemo(
    () => traceReviewDatasetCase(props.detail, props.review, rootSpan.data),
    [props.detail, props.review, rootSpan.data],
  );
  const [datasetId, setDatasetId] = useState("");
  const [form, setForm] = useState(() => caseForm(original));
  const [error, setError] = useState<string>();
  const datasets = useQuery({
    queryKey: ["managed-datasets", props.projectId],
    queryFn: () =>
      api<{ items: ManagedDatasetSummary[] }>(
        `/api/v1/projects/${props.projectId}/managed-datasets`,
      ),
    enabled: open,
  });
  const drafts = useMemo(
    () => datasets.data?.items.filter((dataset) => dataset.draft) ?? [],
    [datasets.data],
  );
  useEffect(() => {
    if (open) {
      setDatasetId((current) => current || drafts[0]?.id || "");
      setForm(caseForm(original));
      setError(undefined);
    }
  }, [drafts, open, original]);
  const selected = drafts.find((dataset) => dataset.id === datasetId);
  const promote = useMutation({
    mutationFn: (item: ManagedDatasetCaseInput) =>
      api<ManagedDatasetVersionDetail>(
        `/api/v1/projects/${props.projectId}/managed-datasets/${selected?.id}/versions/${selected?.draft?.id}/cases`,
        { method: "POST", body: JSON.stringify(item) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["managed-datasets", props.projectId] });
      setOpen(false);
      notify("Trace added to dataset draft");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Promotion failed"),
  });
  const submit = () => {
    try {
      const candidate: Record<string, unknown> = {
        id: form.id,
        input: JSON.parse(form.input),
        metadata: original?.metadata,
      };
      if (form.expected.trim()) candidate.expected = JSON.parse(form.expected);
      const parsed = managedDatasetCaseInputSchema.safeParse(candidate);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid case");
      if (!selected?.draft) throw new Error("Choose a dataset with a draft");
      promote.mutate(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON");
    }
  };

  return (
    <>
      <Button size="sm" disabled={!root} onClick={() => setOpen(true)}>
        Promote to dataset
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Promote failed trace</DialogTitle>
            <DialogDescription>
              Add this trace as a case in an existing managed dataset draft.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {datasets.isLoading || rootSpan.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading trace and datasets…</p>
          ) : rootSpan.isError ? (
            <p className="text-sm text-destructive">Unable to load the trace input.</p>
          ) : !original ? (
            <p className="text-sm text-muted-foreground">The root span has no captured input.</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dataset has an open draft. Create one in{" "}
              <Link
                className="text-primary hover:underline"
                to="/$projectId/evaluations/datasets"
                params={{ projectId: props.projectId }}
                search={{ tab: "managed", page: 1 }}
              >
                Datasets
              </Link>
              .
            </p>
          ) : (
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto p-1 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>Dataset draft</FieldLabel>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={datasetId}
                  onChange={(event) => setDatasetId(event.target.value)}
                >
                  {drafts.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} · {dataset.draft?.version}
                    </option>
                  ))}
                </select>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Case ID</FieldLabel>
                <Input
                  value={form.id}
                  onChange={(event) => setForm({ ...form, id: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>Input JSON</FieldLabel>
                <Textarea
                  rows={10}
                  value={form.input}
                  onChange={(event) => setForm({ ...form, input: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>Expected JSON (optional)</FieldLabel>
                <Textarea
                  rows={10}
                  value={form.expected}
                  onChange={(event) => setForm({ ...form, expected: event.target.value })}
                />
              </Field>
            </div>
          )}
          <DialogFooter showCloseButton>
            <Button disabled={!selected?.draft || !original || promote.isPending} onClick={submit}>
              {promote.isPending ? "Adding…" : "Add case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function caseForm(item?: ManagedDatasetCaseInput) {
  return {
    id: item?.id ?? "",
    input: item ? JSON.stringify(item.input, null, 2) : "",
    expected: item?.expected === undefined ? "" : JSON.stringify(item.expected, null, 2),
  };
}
