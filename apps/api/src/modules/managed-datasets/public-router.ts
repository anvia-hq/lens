import { getPublishedManagedDataset, projectApiKey } from "@lens/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { apiError } from "../../utils/http.js";
import { parseBasicAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { authenticateIngestionKey } from "../ingestion/services.js";

export const createPublicDatasetsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/:name", async (c) => {
    const credentials = parseBasicAuthorization(c.req.header("authorization"));
    if (credentials === undefined) {
      c.header("WWW-Authenticate", 'Basic realm="Lens datasets"');
      return apiError(c, 401, "unauthorized", "Lens public and secret keys are required");
    }
    const key = await authenticateIngestionKey(
      deps.postgres.db,
      credentials.publicKey,
      credentials.secretKey,
      deps.config.INGESTION_KEY_PEPPER,
    );
    if (key === undefined || key.project.state !== "active") {
      return apiError(c, 401, "unauthorized", "Invalid or revoked project key");
    }
    const name = c.req.param("name").trim();
    const version = c.req.query("version")?.trim() || undefined;
    const dataset = await getPublishedManagedDataset(
      deps.postgres.db,
      key.project.id,
      name,
      version,
    );
    if (dataset === undefined) {
      return apiError(c, 404, "not_found", "Published dataset version not found");
    }
    const page = positiveInteger(c.req.query("page"), 1);
    const limit = Math.min(100, positiveInteger(c.req.query("limit"), 50));
    const totalItems = dataset.items.length;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    const start = (page - 1) * limit;
    void deps.postgres.db
      .update(projectApiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(projectApiKey.id, key.apiKeyId));
    return c.json({
      name: dataset.dataset.name,
      version: dataset.version,
      ...(dataset.dataset.description === null ? {} : { description: dataset.dataset.description }),
      ...(Object.keys(dataset.dataset.metadata).length === 0
        ? {}
        : { metadata: dataset.dataset.metadata }),
      items: dataset.items.slice(start, start + limit),
      meta: { page, limit, totalItems, totalPages },
    });
  });

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
