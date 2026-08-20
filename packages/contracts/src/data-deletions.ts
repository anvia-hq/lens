import { z } from "zod";

export const dataDeletionEntityTypes = ["trace", "session", "evaluation_run"] as const;
export const dataDeletionEntityTypeSchema = z.enum(dataDeletionEntityTypes);
export type DataDeletionEntityType = z.infer<typeof dataDeletionEntityTypeSchema>;

export const dataDeletionStatuses = ["queued", "running", "completed", "failed"] as const;
export type DataDeletionStatus = (typeof dataDeletionStatuses)[number];

const traceIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/i, "Invalid trace ID")
  .transform((value) => value.toLowerCase());
const sessionIdSchema = z.string().min(1).max(1_024);
const evaluationRunIdSchema = z.string().min(1).max(128);

export const dataDeletionInputSchema = z
  .object({
    entityType: dataDeletionEntityTypeSchema,
    ids: z.array(z.string()).min(1).max(100),
  })
  .transform((value, context) => {
    const schema =
      value.entityType === "trace"
        ? traceIdSchema
        : value.entityType === "session"
          ? sessionIdSchema
          : evaluationRunIdSchema;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const [index, id] of value.ids.entries()) {
      const parsed = schema.safeParse(id);
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          path: ["ids", index],
          message: parsed.error.issues[0]?.message ?? "Invalid entity ID",
        });
        continue;
      }
      if (!seen.has(parsed.data)) {
        seen.add(parsed.data);
        ids.push(parsed.data);
      }
    }
    return { entityType: value.entityType, ids };
  });
export type DataDeletionInput = z.infer<typeof dataDeletionInputSchema>;

export const deleteDataJobSchema = z.object({ requestId: z.uuid() });
export type DeleteDataJob = z.infer<typeof deleteDataJobSchema>;

export type DataDeletionRequest = {
  id: string;
  projectId: string;
  entityType: DataDeletionEntityType;
  ids: string[];
  status: DataDeletionStatus;
  requestedBy: string;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DataDeletionRequestsResponse = { items: DataDeletionRequest[] };
