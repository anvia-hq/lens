import type { EvaluationResult } from "@lens/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui/components/card";
import { ScrollArea } from "@lens/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lens/ui/components/sheet";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatTimestamp } from "../utils/trace-detail";
import { EvaluationStatusBadge } from "./evaluation-status-badge";
import { PayloadSection } from "./payload-section";
import { PayloadViewSwitch } from "./payload-view-switch";
import { RawJsonBlock } from "./raw-json-block";

export function EvaluationResultDrawer(props: {
  projectId: string;
  result: EvaluationResult | null;
  onOpenChange: (open: boolean) => void;
}) {
  const result = props.result;
  const [payloadView, setPayloadView] = useState<"formatted" | "json">("formatted");

  return (
    <Sheet open={result !== null} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        {result ? (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <EvaluationStatusBadge status={result.outcome} />
                <span className="font-mono text-sm text-muted-foreground">
                  {formatEvaluationResultValue(result)}
                </span>
              </div>
              <SheetTitle className="mt-2">{result.metricName}</SheetTitle>
              <SheetDescription>
                {result.suiteName} · {result.caseId ?? "No case ID"}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-4 p-4">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Result overview</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <DetailField label="Suite">{result.suiteName}</DetailField>
                    <DetailField label="Case">{result.caseId ?? "—"}</DetailField>
                    <DetailField label="Metric">{result.metricName}</DetailField>
                    <DetailField label="Data type">{result.dataType ?? "—"}</DetailField>
                    <DetailField label="Recorded">{formatTimestamp(result.timestamp)}</DetailField>
                    <DetailField label="Environment">{result.environment}</DetailField>
                    <DetailField label="Service">{result.serviceName}</DetailField>
                    <DetailField label="Release">{result.release ?? "—"}</DetailField>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Explanation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap break-words leading-6 text-foreground">
                      {result.explanation ?? "No explanation was reported for this result."}
                    </p>
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Related entities</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <IdentifierField label="Result ID" value={result.id} />
                    {result.runId ? (
                      <IdentifierField label="Run ID">
                        <EntityLink id={result.runId} projectId={props.projectId} kind="run" />
                      </IdentifierField>
                    ) : null}
                    {result.traceId ? (
                      <IdentifierField label="Trace ID">
                        <EntityLink id={result.traceId} projectId={props.projectId} kind="trace" />
                      </IdentifierField>
                    ) : null}
                    {result.observationId ? (
                      <IdentifierField label="Observation ID" value={result.observationId} />
                    ) : null}
                    {result.responseId ? (
                      <IdentifierField label="Response ID" value={result.responseId} />
                    ) : null}
                    {result.configId ? (
                      <IdentifierField label="Config ID" value={result.configId} />
                    ) : null}
                  </CardContent>
                </Card>

                <section className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-base font-medium">Payload</h2>
                    {result.payload ? (
                      <div className="ml-auto">
                        <PayloadViewSwitch value={payloadView} onChange={setPayloadView} />
                      </div>
                    ) : null}
                  </div>
                  {result.payload ? (
                    <div className="grid gap-4">
                      <PayloadSection
                        title="Input"
                        value={result.payload.input}
                        view={payloadView}
                      />
                      <PayloadSection
                        title="Expected"
                        value={result.payload.expected ?? null}
                        view={payloadView}
                      />
                      <PayloadSection
                        title="Output"
                        value={result.payload.output ?? null}
                        view={payloadView}
                      />
                      {result.payload.context !== undefined ? (
                        <PayloadSection
                          title="Context"
                          value={result.payload.context}
                          view={payloadView}
                        />
                      ) : null}
                      {result.payload.retrievalContext !== undefined ? (
                        <PayloadSection
                          title="Retrieval context"
                          value={result.payload.retrievalContext}
                          view={payloadView}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {payloadStatusMessage(result.payloadStatus)}
                    </div>
                  )}
                </section>

                {Object.keys(result.metadata).length ? (
                  <section className="grid gap-3">
                    <h2 className="font-heading text-base font-medium">Metadata</h2>
                    <RawJsonBlock title="Metadata" value={result.metadata} />
                  </section>
                ) : null}

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Ingestion</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <DetailField label="Ingested">{formatTimestamp(result.ingestedAt)}</DetailField>
                    <DetailField label="Schema version">{result.ingestVersion}</DetailField>
                    <DetailField label="Expires">
                      {result.expiresAt ? formatTimestamp(result.expiresAt) : "No expiry"}
                    </DetailField>
                    <DetailField label="Payload status">
                      {result.payloadStatus.replaceAll("_", " ")}
                    </DetailField>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function formatEvaluationResultValue(result: EvaluationResult): string {
  return (
    result.numericValue?.toFixed(3) ??
    result.categoricalValue ??
    (result.dataType === "BOOLEAN" ? result.outcome : "—")
  );
}

function DetailField(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="min-w-0 break-words text-sm font-medium">{props.children}</span>
    </div>
  );
}

function IdentifierField(props: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.children ?? <span className="break-all font-mono text-xs">{props.value}</span>}
    </div>
  );
}

function EntityLink(props: { projectId: string; id: string; kind: "trace" | "run" }) {
  return (
    <Link
      className="flex w-fit max-w-full items-start gap-1 break-all font-mono text-xs text-primary hover:underline"
      to={
        props.kind === "trace"
          ? "/$projectId/traces/$traceId"
          : "/$projectId/evaluations/runs/$runId"
      }
      params={
        props.kind === "trace"
          ? { projectId: props.projectId, traceId: props.id }
          : { projectId: props.projectId, runId: props.id }
      }
    >
      {props.id}
      <ArrowSquareOut className="mt-0.5 size-3.5 shrink-0" />
    </Link>
  );
}

function payloadStatusMessage(status: EvaluationResult["payloadStatus"]): string {
  if (status === "size_limit") return "The evaluation payload exceeded the capture-size limit.";
  if (status === "serialization_error") return "The evaluation payload could not be serialized.";
  if (status === "captured") return "No payload data was included with this result.";
  return "Evaluation payload capture was not enabled for this result.";
}
