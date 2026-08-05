import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const observationKinds = [
  "span",
  "generation",
  "event",
  "embedding",
  "agent",
  "tool",
  "chain",
  "retriever",
  "evaluator",
  "guardrail",
] as const;
export type ObservationKind = (typeof observationKinds)[number];

export const spanStatuses = ["unset", "ok", "error"] as const;
export type SpanStatus = (typeof spanStatuses)[number];

export type NormalizedSpan = {
  projectId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  traceState: string;
  name: string;
  kind: number;
  observationKind: ObservationKind;
  status: SpanStatus;
  statusMessage: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  durationNano: string;
  serviceName: string;
  scopeName: string;
  scopeVersion: string;
  resourceAttributes: Record<string, JsonValue>;
  spanAttributes: Record<string, JsonValue>;
  events: JsonValue[];
  links: JsonValue[];
  traceName: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  version: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  input: JsonValue | null;
  output: JsonValue | null;
  expiresAt: string | null;
  ingestedAt: string;
  ingestVersion: string;
};

export type IngestTraceJob = {
  projectId: string;
  ingestId: string;
  receivedAt: string;
  spans: NormalizedSpan[];
};

export type MaterializeTraceJob = {
  projectId: string;
  traceId: string;
};

export type ReconcileRetentionJob = {
  projectId: string;
  retentionDays: number | null;
};

export type DeleteProjectTelemetryJob = {
  projectId: string;
};

export type ProjectSettings = {
  retentionDays: 7 | 30 | 90 | null;
  redactionPatterns: string[];
};

export type Project = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  state: "active" | "deleting";
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
};

export type ProjectApiKey = {
  id: string;
  projectId: string;
  name: string;
  publicKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedProjectApiKey = ProjectApiKey & {
  secretKey: string;
};

export type SpanDetail = Omit<NormalizedSpan, "projectId" | "expiresAt" | "ingestVersion">;

export type TraceSummary = {
  projectId: string;
  traceId: string;
  name: string;
  serviceName: string;
  status: SpanStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  spanCount: number;
  generationCount: number;
  toolCount: number;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastSeenAt: string;
};

export type TraceDetail = {
  summary: TraceSummary;
  spans: SpanDetail[];
};

export type SessionSummary = {
  projectId: string;
  sessionId: string;
  userId: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  traceCount: number;
  errorCount: number;
  spanCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastSeenAt: string;
};

export type SessionDetail = {
  summary: SessionSummary;
  traces: TraceSummary[];
};

export type TraceFilters = {
  from?: string;
  to?: string;
  status?: SpanStatus;
  service?: string;
  name?: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  tag?: string;
  search?: string;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type MetricPoint = {
  timestamp: string;
  traces: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
};

export type Metrics = {
  traces: number;
  spans: number;
  errors: number;
  errorRate: number;
  durationP50Ms: number;
  durationP95Ms: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  series: MetricPoint[];
};

export const projectSettingsSchema = z.object({
  retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]),
  redactionPatterns: z.array(z.string().trim().min(1).max(256)).max(100),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export function encodeCursor(startedAt: string, traceId: string): string {
  return Buffer.from(JSON.stringify([startedAt, traceId]), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { startedAt: string; traceId: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return undefined;
    }
    return { startedAt: parsed[0], traceId: parsed[1] };
  } catch {
    return undefined;
  }
}
