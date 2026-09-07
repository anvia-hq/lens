import { promptDeploymentQuerySchema } from "@lens/contracts";
import { getPromptDeployment } from "@lens/db";
import { Hono } from "hono";
import { apiError } from "../../utils/http.js";
import { parseBasicAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { authenticateIngestionKey, recordProjectKeyUsage } from "../ingestion/services.js";

export const createPublicPromptsRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().get("/:name", async (c) => {
    const credentials = parseBasicAuthorization(c.req.header("authorization"));
    if (credentials === undefined) {
      c.header("WWW-Authenticate", 'Basic realm="Lens prompts"');
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
    const query = promptDeploymentQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return apiError(
        c,
        400,
        "invalid_selector",
        "Specify either a nonblank label or a positive safe integer version",
      );
    }
    const deployment = await getPromptDeployment(
      deps.postgres.db,
      key.project.id,
      c.req.param("name"),
      query.data,
    );
    if (deployment === undefined) {
      return apiError(c, 404, "not_found", "Prompt not found");
    }
    if (deployment === "no_deployment") {
      return apiError(c, 404, "not_deployed", "No prompt version is deployed under this label");
    }
    if (deployment === "unknown_version") {
      return apiError(c, 404, "unknown_version", "Prompt version not found");
    }
    recordProjectKeyUsage(deps, key.apiKeyId, key.project.id);
    return c.json(deployment);
  });
