export type UserSummary = {
  projectId: string;
  userId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  traceCount: number;
  sessionCount: number;
  errorCount: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
};

export type UserFilters = {
  from?: string;
  to?: string;
  search?: string;
  exactUserId?: string;
};

export const userSortFields = [
  "userId",
  "firstSeenAt",
  "lastSeenAt",
  "traceCount",
  "sessionCount",
  "errorCount",
  "errorRate",
  "totalTokens",
  "totalCost",
] as const;
export type UserSortField = (typeof userSortFields)[number];
