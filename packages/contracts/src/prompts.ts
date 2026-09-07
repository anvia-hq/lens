import { z } from "zod";
import type { JsonValue } from "./shared.js";

export const promptTypes = ["text", "chat"] as const;
export type PromptType = (typeof promptTypes)[number];

export const chatMessageRoles = ["system", "user", "assistant", "tool"] as const;
export type ChatMessageRole = (typeof chatMessageRoles)[number];

export const chatMessageSchema = z.object({
  role: z.enum(chatMessageRoles),
  content: z.string().max(1_000_000),
  name: z.string().trim().min(1).max(128).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

const promptMetadataSchema = z.record(z.string(), z.json());

export const promptContentSchema = z
  .object({
    type: z.enum(promptTypes),
    template: z.string().max(1_000_000).optional(),
    messages: z.array(chatMessageSchema).max(200).optional(),
    config: promptMetadataSchema.optional(),
  })
  .superRefine((content, context) => {
    if (content.type === "text") {
      if (content.messages !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["messages"],
          message: "Text prompts cannot include messages",
        });
      }
      if (content.template === undefined || content.template.trim().length === 0) {
        context.addIssue({
          code: "custom",
          path: ["template"],
          message: "Text prompts require a template",
        });
      }
      return;
    }
    if (content.template !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["template"],
        message: "Chat prompts cannot include a template",
      });
    }
    if (content.messages === undefined || content.messages.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Chat prompts require at least one message",
      });
    }
  });
export type PromptContent = z.infer<typeof promptContentSchema>;

export const promptInputSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(2_000).optional(),
  content: promptContentSchema,
  changeMessage: z.string().trim().max(2_000).optional(),
  labels: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
export type PromptInput = z.infer<typeof promptInputSchema>;

export const promptUpdateSchema = z
  .object({
    description: z.string().trim().max(2_000),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one prompt field is required",
  });
export type PromptUpdate = z.infer<typeof promptUpdateSchema>;

export const promptVersionCommitSchema = promptContentSchema.safeExtend({
  changeMessage: z.string().trim().max(2_000).optional(),
});
export type PromptVersionCommit = z.infer<typeof promptVersionCommitSchema>;

export const promptLabelQuerySchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type PromptLabelQuery = z.infer<typeof promptLabelQuerySchema>;

export const promptLabelInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  version: z.number().int().min(1),
});
export type PromptLabelInput = z.infer<typeof promptLabelInputSchema>;

const promptVersionNumberSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const promptDeploymentQuerySchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    version: z
      .union([
        z.string().trim().regex(/^\d+$/).transform(Number).pipe(promptVersionNumberSchema),
        promptVersionNumberSchema,
      ])
      .optional(),
  })
  .refine((query) => query.label === undefined || query.version === undefined, {
    message: "Specify either label or version, not both",
  });
export type PromptDeploymentQuery = z.infer<typeof promptDeploymentQuerySchema>;

export const DEFAULT_PROMPT_LABEL = "production";

export type PromptVersion = {
  id: string;
  promptId: string;
  version: number;
  type: PromptType;
  template: string | null;
  messages: ChatMessage[] | null;
  config: Record<string, JsonValue>;
  changeMessage: string | null;
  createdBy: string;
  createdAt: string;
};

export type PromptLabel = {
  label: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
};

export type PromptLabelEvent = {
  id: string;
  promptId: string;
  label: string;
  fromVersion: number | null;
  toVersion: number;
  changedBy: string;
  createdAt: string;
};

export type PromptSummary = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  latestVersion: number;
  versionCount: number;
  labels: PromptLabel[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptDetail = PromptSummary & {
  versions: PromptVersion[];
};

export const promptSelectorSchema = z.union([
  z.strictObject({ label: z.string().trim().min(1).max(80) }),
  z.strictObject({ version: promptVersionNumberSchema }),
]);

const resolvedPromptFields = {
  name: z.string().min(1).max(128),
  version: promptVersionNumberSchema,
  config: promptMetadataSchema,
  labels: z.array(z.string().min(1).max(80)),
  selector: promptSelectorSchema,
};

export const resolvedPromptSchema = z.discriminatedUnion("type", [
  z.object({
    ...resolvedPromptFields,
    type: z.literal("text"),
    template: z
      .string()
      .max(1_000_000)
      .refine((value) => value.trim().length > 0),
    messages: z.null(),
  }),
  z.object({
    ...resolvedPromptFields,
    type: z.literal("chat"),
    template: z.null(),
    messages: z.array(chatMessageSchema).min(1).max(200),
  }),
]);
export type ResolvedPrompt = z.infer<typeof resolvedPromptSchema>;
