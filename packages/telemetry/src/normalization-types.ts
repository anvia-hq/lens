import type { IngestVersionClock } from "./ingestion-context.js";
import type { EvaluationResult, EvaluationRun, NormalizedSpan } from "@lens/contracts";

export type NormalizeOptions = {
  projectId: string;
  retentionDays: number | null;
  now?: Date;
  additionalRedactionPatterns?: readonly string[];
  /** Defaults to the process-wide clock. */
  versionClock?: IngestVersionClock;
};

export type NormalizeResult = {
  spans: NormalizedSpan[];
  rejectedSpans: number;
  errors: string[];
};

export type NormalizeEvaluationsResult = {
  evaluations: EvaluationResult[];
  runs: EvaluationRun[];
  rejectedLogRecords: number;
  ignoredLogRecords: number;
  errors: string[];
};
