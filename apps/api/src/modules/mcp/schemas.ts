import {
  alertRuleKinds,
  sessionSortFields,
  sessionStatuses,
  traceSortFields,
  traceStatuses,
} from "@lens/contracts";
import { z } from "zod";

const pageSize = z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25);
const order = z.enum(["asc", "desc"]).default("desc");
const isoDate = z.iso.datetime({ offset: true });
const stringFilter = z.array(z.string().trim().min(1).max(128)).max(50).optional();
const nonNegative = z.number().finite().nonnegative().optional();

export const toolOutputSchema = z.object({
  project: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  webUrl: z.string().nullable(),
  data: z.json(),
});

export const listProjectsInputSchema = z.object({});

export const overviewInputSchema = z.object({
  projectId: z.uuid(),
  range: z.enum(["24h", "7d", "30d"]).default("24h"),
});

export const searchTracesInputSchema = z.object({
  projectId: z.uuid(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  statuses: z.array(z.enum(traceStatuses)).max(4).optional(),
  services: stringFilter,
  names: stringFilter,
  models: stringFilter,
  environments: stringFilter,
  releases: stringFilter,
  versions: stringFilter,
  serviceVersions: stringFilter,
  userId: z.string().trim().min(1).max(256).optional(),
  sessionId: z.string().trim().min(1).max(256).optional(),
  tags: stringFilter,
  review: z.enum(["unreviewed", "pass", "fail"]).optional(),
  search: z.string().trim().min(1).max(256).optional(),
  minDurationMs: nonNegative,
  maxDurationMs: nonNegative,
  minTotalTokens: nonNegative,
  maxTotalTokens: nonNegative,
  minTotalCost: nonNegative,
  maxTotalCost: nonNegative,
  page: z.number().int().positive().max(1_000_000).default(1),
  pageSize,
  sort: z.enum(traceSortFields).default("startedAt"),
  order,
});

export const getTraceInputSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().trim().min(1).max(256),
  includePayload: z.boolean().default(false),
});

export const getSpanInputSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().trim().min(1).max(256),
  spanId: z.string().trim().min(1).max(256),
  includePayload: z.boolean().default(false),
});

export const searchSessionsInputSchema = z.object({
  projectId: z.uuid(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  statuses: z.array(z.enum(sessionStatuses)).max(3).optional(),
  users: stringFilter,
  services: stringFilter,
  models: stringFilter,
  environments: stringFilter,
  tags: stringFilter,
  search: z.string().trim().min(1).max(256).optional(),
  minDurationMs: nonNegative,
  maxDurationMs: nonNegative,
  minTotalTokens: nonNegative,
  maxTotalTokens: nonNegative,
  minTotalCost: nonNegative,
  maxTotalCost: nonNegative,
  page: z.number().int().positive().max(1_000_000).default(1),
  pageSize,
  sort: z.enum(sessionSortFields).default("startedAt"),
  order,
});

export const getSessionInputSchema = z.object({
  projectId: z.uuid(),
  sessionId: z.string().trim().min(1).max(256),
  cursor: z.string().trim().min(1).max(2_000).optional(),
  pageSize,
  includePayload: z.boolean().default(false),
});

export const listAlertsInputSchema = z.object({
  projectId: z.uuid(),
  status: z.enum(["active", "resolved"]).default("active"),
  kind: z.enum(alertRuleKinds).optional(),
  page: z.number().int().positive().max(1_000_000).default(1),
  pageSize,
});

export const getAlertInputSchema = z.object({
  projectId: z.uuid(),
  incidentId: z.uuid(),
});
