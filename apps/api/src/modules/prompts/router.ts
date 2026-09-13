import {
  type PromptLabelInput,
  type PromptUpdate,
  promptInputSchema,
  promptLabelInputSchema,
  promptLabelQuerySchema,
  promptUpdateSchema,
  promptVersionCommitSchema,
} from "@lens/contracts";
import {
  archivePrompt,
  createPrompt,
  createPromptVersion,
  getPrompt,
  listPromptLabelEvents,
  listPrompts,
  setPromptLabel,
  updatePrompt,
} from "@lens/db";
import { Hono } from "hono";
import { canManage, requireProjectAccess } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";

export const createPromptsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/:projectId/prompts", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      return c.json({
        items: await listPrompts(deps.postgres.db, access.project.id, {
          includeArchived: c.req.query("archived") === "true",
        }),
      });
    })
    .post(
      "/:projectId/prompts",
      jsonInput(promptInputSchema, "invalid_prompt", "Invalid prompt"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        try {
          return c.json(
            await createPrompt(
              deps.postgres.db,
              access.project.id,
              requiredSession(c).user.id,
              c.req.valid("json"),
            ),
            201,
          );
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return apiError(c, 409, "duplicate_prompt", "A prompt with this name already exists");
          }
          throw error;
        }
      },
    )
    .get("/:projectId/prompts/:promptId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const detail = await getPrompt(
        deps.postgres.db,
        access.project.id,
        c.req.param("promptId") ?? "",
      );
      return detail === undefined
        ? apiError(c, 404, "not_found", "Prompt not found")
        : c.json(detail);
    })
    .patch(
      "/:projectId/prompts/:promptId",
      jsonInput(promptUpdateSchema, "invalid_prompt", "Invalid prompt update"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const updated = await updatePrompt(
          deps.postgres.db,
          access.project.id,
          c.req.param("promptId") ?? "",
          c.req.valid("json") as PromptUpdate,
        );
        return updated === undefined
          ? apiError(c, 404, "not_found", "Prompt not found")
          : c.json(updated);
      },
    )
    .delete("/:projectId/prompts/:promptId", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      if (!canManage(access.role)) return adminRequired(c);
      const archived = await archivePrompt(
        deps.postgres.db,
        access.project.id,
        c.req.param("promptId") ?? "",
      );
      return archived ? c.body(null, 204) : apiError(c, 404, "not_found", "Prompt not found");
    })
    .post(
      "/:projectId/prompts/:promptId/versions",
      jsonInput(promptVersionCommitSchema, "invalid_version", "Invalid prompt version"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const detail = await createPromptVersion(
          deps.postgres.db,
          access.project.id,
          c.req.param("promptId") ?? "",
          requiredSession(c).user.id,
          c.req.valid("json"),
        );
        return detail === undefined
          ? apiError(c, 404, "not_found", "Prompt not found")
          : c.json(detail, 201);
      },
    )
    .post(
      "/:projectId/prompts/:promptId/labels",
      jsonInput(promptLabelInputSchema, "invalid_label", "Invalid prompt label"),
      async (c) => {
        const access = await accessFor(c, deps);
        if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
        if (!canManage(access.role)) return adminRequired(c);
        const result = await setPromptLabel(
          deps.postgres.db,
          access.project.id,
          c.req.param("promptId") ?? "",
          requiredSession(c).user.id,
          c.req.valid("json") as PromptLabelInput,
        );
        if (result === "unknown_version") {
          return apiError(c, 404, "unknown_version", "Prompt version not found");
        }
        return result === undefined
          ? apiError(c, 404, "not_found", "Prompt not found")
          : c.json(result);
      },
    )
    .get("/:projectId/prompts/:promptId/history", async (c) => {
      const access = await accessFor(c, deps);
      if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
      const parsed = promptLabelQuerySchema.safeParse({
        label: c.req.query("label") || undefined,
        limit: c.req.query("limit"),
      });
      if (!parsed.success) {
        return apiError(c, 400, "invalid_query", "Invalid history query");
      }
      const events = await listPromptLabelEvents(
        deps.postgres.db,
        access.project.id,
        c.req.param("promptId") ?? "",
        parsed.data,
      );
      return c.json({ items: events });
    });

async function accessFor(c: Parameters<typeof requiredSession>[0], deps: ApiDependencies) {
  return requireProjectAccess(
    deps.postgres.db,
    c.req.param("projectId") ?? "",
    requiredSession(c).user.id,
  );
}

function adminRequired(c: Parameters<typeof apiError>[0]) {
  return apiError(c, 403, "forbidden", "Admin access is required");
}
