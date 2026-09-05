import {
  type AlertContributorHint,
  type AlertDelivery,
  type AlertDeliveryStatus,
  type AlertIncident,
  type AlertIncidentDetail,
  type AlertRuleInput,
  type AlertRuleKind,
  type ManagedDatasetCaseInput,
  type ManagedDatasetSummary,
  type ManagedDatasetVersionDetail,
  managedDatasetCaseImportSchema,
  type SpanDetail,
  type TraceDetail,
} from "@lens/contracts";
import { Badge } from "@lens/ui/components/badge";
import { Button } from "@lens/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@lens/ui/components/chart";
import { Checkbox } from "@lens/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lens/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@lens/ui/components/field";
import { Input } from "@lens/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@lens/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lens/ui/components/table";
import { Textarea } from "@lens/ui/components/textarea";
import { Pulse as Activity, ArrowLeft, Bell, Check, Database } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { EmptyState } from "../../../components/empty-state";
import { ErrorAlert } from "../../../components/error-alert";
import { FullPageMessage } from "../../../components/full-page-message";
import { Page } from "../../../components/page";
import { ApiError, api } from "../../../lib/api";
import { notify } from "../../projects/utils";
import type { AlertIncidentState } from "../hooks/use-alerts";
import { buildSpanForest } from "../utils/trace-detail";
import { StatusBadge } from "./status-badge";

const kindLabels: Record<AlertRuleKind, string> = {
  trace_error_rate: "Trace error rate",
  trace_p95_latency_ms: "P95 trace duration",
  tool_error_rate: "Tool error rate",
  failed_human_review: "Failed human review",
  failed_quality_gate: "Failed quality gate",
};

const contributorDimensionLabels = {
  release: "Release",
  service: "Service",
  serviceVersion: "Service version",
  model: "Model",
  tool: "Tool",
} as const;

export function AlertIncidentView({ state }: { state: AlertIncidentState }) {
  const detail = state.detail.data;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);
  if (state.detail.isLoading)
    return <FullPageMessage icon={<Bell />} text="Loading incident" contained />;
  if (state.detail.error)
    return (
      <div className="p-6">
        <ErrorAlert error={state.detail.error} />
      </div>
    );
  if (!detail) return <FullPageMessage icon={<Bell />} text="Incident not found" contained />;
  const canManage = state.project.role === "owner" || state.project.role === "admin";
  const active = detail.incident.status !== "resolved";
  const selectable = detail.evidenceTraces.filter((item) => item.trace !== null);

  return (
    <Page
      eyebrow={kindLabels[detail.incident.kind]}
      title={detail.incident.ruleName}
      description={detail.incident.summary}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <IncidentStatus incident={detail.incident} />
          {detail.incident.status === "open" ? (
            <Button
              variant="outline"
              disabled={state.acknowledge.isPending}
              onClick={() => state.acknowledge.mutate()}
            >
              <Check /> Acknowledge
            </Button>
          ) : null}
          {active ? (
            <Button
              variant="outline"
              disabled={state.resolve.isPending}
              onClick={() => state.resolve.mutate()}
            >
              Resolve
            </Button>
          ) : null}
        </div>
      }
    >
      <Button
        className="w-fit"
        size="sm"
        variant="ghost"
        render={
          <Link
            to="/$projectId/alerts"
            params={{ projectId: state.project.id }}
            search={{ tab: "incidents", status: active ? "active" : "resolved", page: 1 }}
          />
        }
      >
        <ArrowLeft /> Back to alerts
      </Button>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FactCard
          label={detail.incident.kind === "trace_p95_latency_ms" ? "Observed P95" : "Observed"}
          value={incidentValue(detail.incident)}
        />
        <FactCard label="Samples" value={detail.incident.sampleCount?.toLocaleString() ?? "—"} />
        <FactCard label="First triggered" value={formatTime(detail.incident.firstTriggeredAt)} />
        <FactCard label="Last seen" value={formatTime(detail.incident.lastTriggeredAt)} />
      </div>

      {detail.signal ? <SignalChart detail={detail} /> : null}

      {detail.contributorAnalysis ? (
        <ContributorAnalysis detail={detail} projectId={state.project.id} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Evidence</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Traces captured when this incident was evaluated.
              </p>
            </div>
            {canManage && selected.size ? (
              <Button size="sm" onClick={() => setPromoting(true)}>
                <Database /> Promote {selected.size}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <EvidenceTable
              detail={detail}
              projectId={state.project.id}
              canSelect={canManage}
              selected={selected}
              onSelect={setSelected}
            />
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <RuleCard detail={detail} />
          <DeliveriesCard deliveries={detail.deliveries} />
          <LifecycleCard incident={detail.incident} />
        </div>
      </div>

      <PromoteEvidenceDialog
        open={promoting}
        projectId={state.project.id}
        incident={detail.incident}
        traceIds={[...selected].filter((traceId) =>
          selectable.some((item) => item.traceId === traceId),
        )}
        onClose={() => setPromoting(false)}
        onDone={() => {
          setPromoting(false);
          setSelected(new Set());
        }}
      />
    </Page>
  );
}

export function ContributorAnalysis({
  detail,
  projectId,
}: {
  detail: AlertIncidentDetail;
  projectId: string;
}) {
  const analysis = detail.contributorAnalysis;
  if (!analysis) return null;
  const empty = {
    telemetry_expired: {
      title: "Contributor telemetry expired",
      text: "The incident is retained, but the baseline and breach telemetry is no longer available.",
    },
    insufficient_data: {
      title: "No strong contributor found",
      text: "No release, model, service, version, or tool passed the conservative evidence thresholds.",
    },
    analysis_failed: {
      title: "Contributor analysis unavailable",
      text: "The incident remains available. Refresh the page to retry this analysis.",
    },
  } as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Likely contributors</CardTitle>
        <p className="text-sm text-muted-foreground">
          Baseline {formatTime(analysis.baselineFrom)}–{formatTime(analysis.baselineTo)} compared
          with breach {formatTime(analysis.breachFrom)}–{formatTime(analysis.breachTo)}. These are
          deterministic investigation hints, not proof of causation.
        </p>
      </CardHeader>
      <CardContent>
        {analysis.hints.length ? (
          <div className="divide-y rounded-lg border">
            {analysis.hints.map((hint) => (
              <div
                className="flex flex-wrap items-center justify-between gap-4 p-4"
                key={`${hint.dimension}-${hint.value}`}
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{contributorDimensionLabels[hint.dimension]}</Badge>
                    <span className="truncate font-medium">{hint.value}</span>
                    {hint.isNew ? <Badge variant="secondary">New in breach</Badge> : null}
                  </div>
                  <p className="text-sm">
                    {hint.metric === "errorRate" ? "Error rate" : "P95 duration"} ·{" "}
                    {hint.isNew ? "overall baseline" : "baseline"}{" "}
                    <span className="font-medium">
                      {formatContributorValue(hint, hint.baseline.value)}
                    </span>
                    {" → breach "}
                    <span className="font-medium">
                      {formatContributorValue(hint, hint.breach.value)}
                    </span>
                    <span className="ml-2 text-destructive">{formatContributorDelta(hint)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hint.baseline.sampleCount.toLocaleString()} baseline samples ·{" "}
                    {hint.breach.sampleCount.toLocaleString()} breach samples
                  </p>
                </div>
                <ContributorTraceAction hint={hint} projectId={projectId} />
              </div>
            ))}
          </div>
        ) : analysis.unavailableReason ? (
          <EmptyState
            icon={<Activity />}
            title={empty[analysis.unavailableReason].title}
            text={empty[analysis.unavailableReason].text}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContributorTraceAction({
  hint,
  projectId,
}: {
  hint: AlertContributorHint;
  projectId: string;
}) {
  if (hint.baselineTraceId && hint.breachTraceId && hint.baselineTraceId !== hint.breachTraceId) {
    return (
      <Button
        size="sm"
        variant="outline"
        render={
          <Link
            to="/$projectId/traces/compare"
            params={{ projectId }}
            search={{ traceIds: [hint.baselineTraceId, hint.breachTraceId] }}
          />
        }
      >
        Compare traces
      </Button>
    );
  }
  if (!hint.breachTraceId) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      render={
        <Link
          to="/$projectId/traces/$traceId"
          params={{ projectId, traceId: hint.breachTraceId }}
          search={{}}
        />
      }
    >
      Open breach trace
    </Button>
  );
}

function SignalChart({ detail }: { detail: AlertIncidentDetail }) {
  const signal = detail.signal;
  if (!signal) return null;
  const hasData = signal.points.some((point) => point.value !== null);
  const percentage = detail.incident.kind !== "trace_p95_latency_ms";
  const breach = nearestPoint(
    signal.points.map((point) => point.timestamp),
    detail.incident.firstTriggeredAt,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signal history</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatTime(signal.from)} to {formatTime(signal.to)} · {signal.bucketMinutes}-minute
          buckets
        </p>
        {detail.incident.kind === "trace_p95_latency_ms" ? (
          <p className="text-sm text-muted-foreground">
            Each point is the P95 of full trace durations in that bucket, not TTFT.
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer
            className="h-72 w-full"
            config={{
              value: { label: kindLabels[detail.incident.kind], color: "var(--viz-gold)" },
            }}
          >
            <LineChart data={signal.points} margin={{ left: 4, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={shortChartTime}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                tickFormatter={(value) =>
                  percentage
                    ? `${Math.round(Number(value) * 100)}%`
                    : `${Math.round(Number(value))}ms`
                }
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(value) => formatTime(String(value))} />
                }
              />
              {detail.incident.threshold !== null ? (
                <ReferenceLine
                  y={detail.incident.threshold}
                  stroke="var(--viz-red)"
                  strokeDasharray="4 4"
                  label="Threshold"
                />
              ) : null}
              {breach ? (
                <ReferenceLine
                  x={breach}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="3 3"
                  label="First breach"
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <EmptyState
            icon={<Activity />}
            title="Signal data expired"
            text="The incident is retained, but its telemetry is no longer available."
          />
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceTable(props: {
  detail: AlertIncidentDetail;
  projectId: string;
  canSelect: boolean;
  selected: Set<string>;
  onSelect: (value: Set<string>) => void;
}) {
  const evidence = props.detail.evidenceTraces;
  if (!evidence.length) {
    const gate = props.detail.incident.evidence;
    if (gate.qualityGateId && gate.candidateRunId && gate.baselineRunId) {
      return (
        <Button
          variant="outline"
          render={
            <Link
              to="/$projectId/evaluations/compare"
              params={{ projectId: props.projectId }}
              search={{
                gateId: gate.qualityGateId,
                candidateRunId: gate.candidateRunId,
                baselineRunId: gate.baselineRunId,
              }}
            />
          }
        >
          Open quality-gate comparison
        </Button>
      );
    }
    return (
      <EmptyState
        icon={<Bell />}
        title="No trace evidence"
        text="This incident did not capture an evidence trace."
      />
    );
  }
  const retained = evidence.filter((item) => item.trace !== null);
  const allSelected =
    retained.length > 0 && retained.every((item) => props.selected.has(item.traceId));
  const toggle = (traceId: string, checked: boolean) => {
    const next = new Set(props.selected);
    if (checked) next.add(traceId);
    else next.delete(traceId);
    props.onSelect(next);
  };
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            {props.canSelect ? (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all retained traces"
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    props.onSelect(
                      checked ? new Set(retained.map((item) => item.traceId)) : new Set(),
                    )
                  }
                />
              </TableHead>
            ) : null}
            <TableHead>Trace</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Review</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {evidence.map((item) => {
            const trace = item.trace;
            return (
              <TableRow key={item.traceId}>
                {props.canSelect ? (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select trace ${item.traceId}`}
                      disabled={!trace}
                      checked={props.selected.has(item.traceId)}
                      onCheckedChange={(checked) => toggle(item.traceId, checked)}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  {trace ? (
                    <div className="grid min-w-48 gap-0.5">
                      <Link
                        className="font-medium hover:underline"
                        to="/$projectId/traces/$traceId"
                        params={{ projectId: props.projectId, traceId: item.traceId }}
                        search={{}}
                      >
                        {trace.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.traceId.slice(0, 12)}
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-0.5">
                      <span className="font-mono text-xs">{item.traceId.slice(0, 12)}</span>
                      <span className="text-xs text-muted-foreground">
                        Trace no longer retained
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>{trace ? <StatusBadge status={trace.status} /> : "—"}</TableCell>
                <TableCell>
                  {trace ? (
                    <div className="grid gap-0.5">
                      <span>{trace.serviceName}</span>
                      <span className="text-xs text-muted-foreground">
                        {trace.environment}
                        {trace.release ? ` · ${trace.release}` : ""}
                      </span>
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{trace ? formatDuration(trace.durationMs) : "—"}</TableCell>
                <TableCell>
                  {trace?.reviewOutcome ? (
                    <Badge variant={trace.reviewOutcome === "fail" ? "destructive" : "secondary"}>
                      {trace.reviewOutcome}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Unreviewed</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RuleCard({ detail }: { detail: AlertIncidentDetail }) {
  const rule = detail.rule;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rule context</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <Fact label="Trigger" value={kindLabels[detail.incident.kind]} />
        {rule ? (
          <>
            <Fact label="Condition" value={ruleCondition(rule)} />
            <Fact label="Scope" value={ruleScope(rule)} />
          </>
        ) : (
          <p className="text-muted-foreground">
            The rule was deleted before its configuration could be preserved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function deliveryStatusVariant(status: AlertDeliveryStatus) {
  return status === "delivered" ? "default" : status === "failed" ? "destructive" : "secondary";
}

function DeliveriesCard({ deliveries }: { deliveries: AlertDelivery[] }) {
  if (deliveries.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliveries</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="grid gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{delivery.channelName}</span>
              <Badge variant="secondary">{delivery.channelType}</Badge>
              <Badge variant={deliveryStatusVariant(delivery.status)}>{delivery.status}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {delivery.status === "delivered" && delivery.deliveredAt
                ? `Delivered ${formatTime(delivery.deliveredAt)}`
                : `Created ${formatTime(delivery.createdAt)}`}{" "}
              · {delivery.attempts} {delivery.attempts === 1 ? "attempt" : "attempts"}
            </span>
            {delivery.error ? (
              <span className="truncate text-xs text-destructive" title={delivery.error}>
                {delivery.error}
              </span>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
function LifecycleCard({ incident }: { incident: AlertIncident }) {
  const events = [
    { label: "Triggered", time: incident.firstTriggeredAt, detail: "Incident opened" },
    ...(incident.lastTriggeredAt !== incident.firstTriggeredAt
      ? [
          {
            label: "Last seen",
            time: incident.lastTriggeredAt,
            detail: "Signal was still breached",
          },
        ]
      : []),
    ...(incident.acknowledgedAt
      ? [
          {
            label: "Acknowledged",
            time: incident.acknowledgedAt,
            detail: incident.acknowledgedBy?.name ?? "Unknown member",
          },
        ]
      : []),
    ...(incident.resolvedAt
      ? [
          {
            label: "Resolved",
            time: incident.resolvedAt,
            detail: incident.resolvedBy?.name ?? resolutionLabel(incident.resolution),
          },
        ]
      : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-4 border-l pl-4">
          {events.map((event) => (
            <li
              key={`${event.label}-${event.time}`}
              className="relative grid gap-0.5 before:absolute before:-left-[1.27rem] before:top-1.5 before:size-2 before:rounded-full before:bg-primary"
            >
              <span className="font-medium">{event.label}</span>
              <span className="text-xs text-muted-foreground">
                {formatTime(event.time)} · {event.detail}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

type CaseDraft = { traceId: string; id: string; input: string; expected: string; observed: string };

function PromoteEvidenceDialog(props: {
  open: boolean;
  projectId: string;
  incident: AlertIncident;
  traceIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [datasetId, setDatasetId] = useState("");
  const [activeTraceId, setActiveTraceId] = useState("");
  const [drafts, setDrafts] = useState<CaseDraft[]>([]);
  const [error, setError] = useState<string>();
  const datasets = useQuery({
    queryKey: ["managed-datasets", props.projectId],
    queryFn: () =>
      api<{ items: ManagedDatasetSummary[] }>(
        `/api/v1/projects/${props.projectId}/managed-datasets`,
      ),
    enabled: props.open,
  });
  const details = useQuery({
    queryKey: ["incident-promotion-traces", props.projectId, props.traceIds],
    queryFn: () =>
      Promise.all(
        props.traceIds.map(async (traceId) => {
          try {
            const detail = await api<TraceDetail>(
              `/api/v1/projects/${props.projectId}/traces/${traceId}`,
            );
            const root = buildSpanForest(detail.spans)[0]?.span;
            const span = root
              ? await api<SpanDetail>(
                  `/api/v1/projects/${props.projectId}/traces/${traceId}/spans/${root.spanId}`,
                )
              : null;
            return { traceId, span };
          } catch (cause) {
            if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
            return { traceId, span: null };
          }
        }),
      ),
    enabled: props.open && props.traceIds.length > 0,
  });
  const datasetDrafts = useMemo(
    () => datasets.data?.items.filter((item) => item.draft) ?? [],
    [datasets.data],
  );
  useEffect(() => {
    if (!props.open) return;
    setDatasetId((current) => current || datasetDrafts[0]?.id || "");
    if (!details.data) return;
    const next = details.data.flatMap(({ traceId, span }) => {
      if (!span || span.input === null) return [];
      return [
        {
          traceId,
          id: traceId,
          input: JSON.stringify(span.input, null, 2),
          expected: "",
          observed: span.output === null ? "" : JSON.stringify(span.output, null, 2),
        },
      ];
    });
    setDrafts(next);
    setActiveTraceId((current) =>
      current && next.some((item) => item.traceId === current) ? current : (next[0]?.traceId ?? ""),
    );
    setError(undefined);
  }, [datasetDrafts, details.data, props.open]);
  const selectedDataset = datasetDrafts.find((item) => item.id === datasetId);
  const active = drafts.find((item) => item.traceId === activeTraceId);
  const promote = useMutation({
    mutationFn: (items: ManagedDatasetCaseInput[]) =>
      api<ManagedDatasetVersionDetail>(
        `/api/v1/projects/${props.projectId}/managed-datasets/${selectedDataset?.id}/versions/${selectedDataset?.draft?.id}/cases/import`,
        { method: "POST", body: JSON.stringify({ items }) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["managed-datasets", props.projectId] });
      notify(`${drafts.length} ${drafts.length === 1 ? "trace" : "traces"} added to dataset draft`);
      props.onDone();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Promotion failed"),
  });
  const update = (changes: Partial<CaseDraft>) =>
    setDrafts((items) =>
      items.map((item) => (item.traceId === activeTraceId ? { ...item, ...changes } : item)),
    );
  const submit = () => {
    try {
      if (!selectedDataset?.draft) throw new Error("Choose a dataset with an open draft");
      promote.mutate(incidentPromotionItems(drafts, props.incident));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON");
    }
  };
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>Promote evidence traces</DialogTitle>
          <DialogDescription>
            Review each case before adding the selected traces to one dataset draft.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-6 py-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {details.isLoading || datasets.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading traces and datasets…</p>
          ) : null}
          {!details.isLoading && drafts.length < props.traceIds.length ? (
            <p className="text-sm text-muted-foreground">
              {props.traceIds.length - drafts.length} selected{" "}
              {props.traceIds.length - drafts.length === 1 ? "trace was" : "traces were"} excluded
              because its input is no longer available.
            </p>
          ) : null}
          <Field>
            <FieldLabel>Dataset draft</FieldLabel>
            <NativeSelect value={datasetId} onChange={(event) => setDatasetId(event.target.value)}>
              <NativeSelectOption value="">Select a dataset</NativeSelectOption>
              {datasetDrafts.map((dataset) => (
                <NativeSelectOption key={dataset.id} value={dataset.id}>
                  {dataset.name} · {dataset.draft?.version}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {!datasets.isLoading && !datasetDrafts.length ? (
              <FieldDescription>No managed dataset has an open draft.</FieldDescription>
            ) : null}
          </Field>
          {drafts.length > 1 ? (
            <Field>
              <FieldLabel>Case</FieldLabel>
              <NativeSelect
                value={activeTraceId}
                onChange={(event) => setActiveTraceId(event.target.value)}
              >
                {drafts.map((draft, index) => (
                  <NativeSelectOption key={draft.traceId} value={draft.traceId}>
                    Case {index + 1} · {draft.traceId.slice(0, 12)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          {active ? (
            <>
              <Field>
                <FieldLabel>Case ID</FieldLabel>
                <Input value={active.id} onChange={(event) => update({ id: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Input JSON</FieldLabel>
                <Textarea
                  rows={8}
                  value={active.input}
                  onChange={(event) => update({ input: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>Observed output</FieldLabel>
                <Textarea
                  className="text-muted-foreground"
                  readOnly
                  rows={6}
                  value={active.observed || "No output captured"}
                />
                <FieldDescription>
                  Reference only; a failed output is never copied into expected output.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Expected JSON (optional)</FieldLabel>
                <Textarea
                  rows={8}
                  placeholder="Leave blank or enter the corrected expected output"
                  value={active.expected}
                  onChange={(event) => update({ expected: event.target.value })}
                />
              </Field>
            </>
          ) : null}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selectedDataset?.draft || !drafts.length || promote.isPending}
            onClick={submit}
          >
            {promote.isPending
              ? "Adding…"
              : `Add ${drafts.length || ""} ${drafts.length === 1 ? "case" : "cases"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function incidentPromotionItems(
  drafts: CaseDraft[],
  incident: Pick<AlertIncident, "id" | "kind" | "ruleName">,
): ManagedDatasetCaseInput[] {
  const parsed = managedDatasetCaseImportSchema.safeParse({
    items: drafts.map((draft) => ({
      id: draft.id,
      input: JSON.parse(draft.input),
      ...(draft.expected.trim() ? { expected: JSON.parse(draft.expected) } : {}),
      metadata: {
        sourceIncidentId: incident.id,
        sourceTraceId: draft.traceId,
        alertKind: incident.kind,
        alertRuleName: incident.ruleName,
      },
    })),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid cases");
  return parsed.data.items;
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-medium">{value}</span>
      </CardContent>
    </Card>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}
function IncidentStatus({ incident }: { incident: AlertIncident }) {
  return (
    <Badge
      variant={
        incident.status === "open"
          ? "destructive"
          : incident.status === "acknowledged"
            ? "secondary"
            : "outline"
      }
    >
      {incident.status}
    </Badge>
  );
}
function incidentValue(incident: AlertIncident) {
  if (incident.observedValue === null) return "Event alert";
  return incident.kind === "trace_p95_latency_ms"
    ? `${Math.round(incident.observedValue)} ms / ${Math.round(incident.threshold ?? 0)} ms`
    : `${(incident.observedValue * 100).toFixed(1)}% / ${((incident.threshold ?? 0) * 100).toFixed(1)}%`;
}
function ruleCondition(rule: AlertRuleInput) {
  if (rule.kind === "failed_human_review") return "Any failed review";
  if (rule.kind === "failed_quality_gate") return `Gate ${rule.qualityGateId}`;
  const threshold =
    rule.kind === "trace_p95_latency_ms" ? `${rule.threshold} ms` : `${rule.threshold * 100}%`;
  return `${threshold} over ${rule.windowMinutes} minutes · minimum ${rule.minimumSamples} samples`;
}
function ruleScope(rule: AlertRuleInput) {
  if (rule.kind === "failed_quality_gate") return "Selected quality gate";
  const values = [
    rule.environment,
    rule.serviceName,
    rule.kind === "tool_error_rate" ? rule.toolName : undefined,
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "All telemetry";
}
function resolutionLabel(value: string | null) {
  return (
    (
      {
        manual: "Resolved manually",
        healthy: "Signal recovered",
        review_passed: "Review passed",
        gate_passed: "Gate passed",
        rule_changed: "Rule changed",
        rule_deleted: "Rule deleted",
      } as Record<string, string>
    )[value ?? ""] ?? "Resolved automatically"
  );
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}
function shortChartTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : value;
}
function formatDuration(value: number) {
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} s`;
}
function formatContributorValue(hint: AlertContributorHint, value: number) {
  return hint.metric === "errorRate" ? `${(value * 100).toFixed(1)}%` : formatDuration(value);
}
function formatContributorDelta(hint: AlertContributorHint) {
  if (hint.metric === "errorRate") return `+${(hint.delta * 100).toFixed(1)} pp`;
  return `+${formatDuration(hint.delta)} (+${Math.round((hint.percentChange ?? 0) * 100)}%)`;
}
function nearestPoint(points: string[], target: string) {
  const targetMs = Date.parse(target);
  return points.reduce<string | undefined>(
    (nearest, point) =>
      nearest === undefined ||
      Math.abs(Date.parse(point) - targetMs) < Math.abs(Date.parse(nearest) - targetMs)
        ? point
        : nearest,
    undefined,
  );
}
