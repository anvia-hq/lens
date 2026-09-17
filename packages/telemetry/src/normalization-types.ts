import type { EvaluationResult, EvaluationRun, NormalizedSpan } from "@lens/contracts";

export type NormalizeOptions = {
  projectId: string;
  retentionDays: number | null;
  now?: Date;
  additionalRedactionPatterns?: readonly string[];
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
