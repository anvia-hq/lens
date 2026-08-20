import type { EvaluationResult, TraceReviewInput, TraceSummary } from "@lens/contracts";

export function traceReviewResult(args: {
  projectId: string;
  trace: TraceSummary;
  expiresAt: string;
  input: TraceReviewInput;
  reviewer: { id: string; name: string };
  now?: Date;
}): EvaluationResult {
  const now = args.now ?? new Date();
  const summary = args.trace;
  return {
    projectId: args.projectId,
    id: `review:${summary.traceId}`,
    runId: null,
    timestamp: summary.startedAt,
    traceId: summary.traceId,
    observationId: null,
    responseId: null,
    suiteName: "production-review",
    caseId: null,
    metricName: "human-review",
    outcome: args.input.outcome,
    dataType: "BOOLEAN",
    numericValue: args.input.outcome === "pass" ? 1 : 0,
    categoricalValue: null,
    explanation: args.input.explanation ?? null,
    payload: null,
    payloadStatus: "not_requested",
    configId: null,
    serviceName: summary.serviceName,
    environment: summary.environment,
    release: summary.release,
    metadata: {},
    source: "human",
    reviewer: args.reviewer,
    expiresAt: args.expiresAt,
    ingestedAt: now.toISOString(),
    ingestVersion: (
      BigInt(now.getTime()) * 1_000_000n +
      (process.hrtime.bigint() % 1_000_000n)
    ).toString(),
  };
}
