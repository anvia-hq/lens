import { costRecalculation, jobOutbox, jobOutboxValues, llmModelPrice } from "@lens/db";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { appMembership } from "../../utils/access.js";
import { apiError, jsonInput, requiredSession } from "../../utils/http.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { modelPriceSchema, recalculationSchema, updateModelPriceSchema } from "./schema.js";
import {
  isUniqueViolation,
  listOrganizationModels,
  listOrganizationRecalculations,
} from "./services.js";

export const createLlmModelsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const app = await membership(deps, requiredSession(c).user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      return c.json(
        await listOrganizationModels(deps.postgres.db, deps.clickhouse, app.organization.id),
      );
    })
    .get("/recalculations", async (c) => {
      const app = await membership(deps, requiredSession(c).user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      return c.json(await listOrganizationRecalculations(deps.postgres.db, app.organization.id));
    })
    .post(
      "/recalculations",
      jsonInput(
        recalculationSchema,
        "invalid_range",
        (error) => error.issues[0]?.message ?? "Invalid range",
      ),
      async (c) => {
        const session = requiredSession(c);
        const app = await membership(deps, session.user.id);
        if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
        const parsed = c.req.valid("json");
        const active = await deps.postgres.db
          .select({ id: costRecalculation.id })
          .from(costRecalculation)
          .where(
            and(
              eq(costRecalculation.organizationId, app.organization.id),
              inArray(costRecalculation.status, ["queued", "running"]),
            ),
          )
          .limit(1);
        if (active.length > 0) {
          return apiError(c, 409, "recalculation_active", "A recalculation is already active");
        }
        const prices = await deps.postgres.db
          .select()
          .from(llmModelPrice)
          .where(eq(llmModelPrice.organizationId, app.organization.id));
        if (prices.length === 0) {
          return apiError(c, 400, "no_prices", "Configure at least one model price first");
        }
        let created: typeof costRecalculation.$inferSelect | undefined;
        try {
          created = await deps.postgres.db.transaction(async (tx) => {
            const [row] = await tx
              .insert(costRecalculation)
              .values({
                organizationId: app.organization.id,
                requestedBy: session.user.id,
                from: parsed.from === undefined ? null : new Date(parsed.from),
                to: parsed.to === undefined ? null : new Date(parsed.to),
                priceSnapshot: prices.map((price) => ({
                  model: price.model,
                  inputPricePerMillion: Number(price.inputPricePerMillion),
                  cachedInputPricePerMillion:
                    price.cachedInputPricePerMillion === null
                      ? null
                      : Number(price.cachedInputPricePerMillion),
                  outputPricePerMillion: Number(price.outputPricePerMillion),
                })),
              })
              .returning();
            if (row === undefined) return undefined;
            await tx.insert(jobOutbox).values(
              jobOutboxValues({
                queue: "costs",
                name: "recalculate-model-costs",
                payload: { recalculationId: row.id },
              }),
            );
            return row;
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return apiError(c, 409, "recalculation_active", "A recalculation is already active");
          }
          throw error;
        }
        if (created === undefined) {
          return apiError(c, 500, "create_failed", "Recalculation was not created");
        }
        return c.json({ id: created.id, status: created.status }, 202);
      },
    )
    .post("/", jsonInput(modelPriceSchema, "invalid_price", "Invalid model price"), async (c) => {
      const app = await membership(deps, requiredSession(c).user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      const parsed = c.req.valid("json");
      try {
        const [created] = await deps.postgres.db
          .insert(llmModelPrice)
          .values({
            organizationId: app.organization.id,
            model: parsed.model,
            ...priceValues(parsed),
          })
          .returning();
        return c.json(created, 201);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return apiError(c, 409, "model_exists", "This model is already configured");
        }
        throw error;
      }
    })
    .patch(
      "/:modelId",
      jsonInput(updateModelPriceSchema, "invalid_price", "Invalid model price"),
      async (c) => {
        const app = await membership(deps, requiredSession(c).user.id);
        if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
        const parsed = c.req.valid("json");
        const [updated] = await deps.postgres.db
          .update(llmModelPrice)
          .set({ ...priceValues(parsed), updatedAt: new Date() })
          .where(
            and(
              eq(llmModelPrice.id, c.req.param("modelId")),
              eq(llmModelPrice.organizationId, app.organization.id),
            ),
          )
          .returning();
        if (updated === undefined) return apiError(c, 404, "not_found", "Model price not found");
        return c.json(updated);
      },
    )
    .delete("/:modelId", async (c) => {
      const app = await membership(deps, requiredSession(c).user.id);
      if (app === undefined) return apiError(c, 403, "forbidden", "Membership is required");
      const [deleted] = await deps.postgres.db
        .delete(llmModelPrice)
        .where(
          and(
            eq(llmModelPrice.id, c.req.param("modelId")),
            eq(llmModelPrice.organizationId, app.organization.id),
          ),
        )
        .returning({ id: llmModelPrice.id });
      if (deleted === undefined) return apiError(c, 404, "not_found", "Model price not found");
      return c.body(null, 204);
    });

function membership(deps: ApiDependencies, userId: string) {
  return appMembership(deps.postgres.db, userId);
}

function priceValues(input: {
  inputPricePerMillion: number;
  cachedInputPricePerMillion?: number | null;
  outputPricePerMillion: number;
}) {
  return {
    inputPricePerMillion: String(input.inputPricePerMillion),
    cachedInputPricePerMillion:
      input.cachedInputPricePerMillion === null || input.cachedInputPricePerMillion === undefined
        ? null
        : String(input.cachedInputPricePerMillion),
    outputPricePerMillion: String(input.outputPricePerMillion),
  };
}
