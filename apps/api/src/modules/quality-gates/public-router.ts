import { qualityGateCheckInputSchema } from "@lens/contracts";
import { Hono } from "hono";
import { apiError, safeJson } from "../../utils/http.js";
import { parseBasicAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { recordQualityGateAlert } from "../alerts/events.js";
import { authenticateIngestionKey, recordProjectKeyUsage } from "../ingestion/services.js";
import { checkEvaluationRuns } from "./check.js";

export const createPublicQualityGatesRouter = (deps: ApiDependencies) =>
  new Hono<AppEnv>().post("/:gateId/evaluate", async (c) => {
    const credentials = parseBasicAuthorization(c.req.header("authorization"));
    if (credentials === undefined) {
      c.header("WWW-Authenticate", 'Basic realm="Lens quality gates"');
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
    const input = qualityGateCheckInputSchema.safeParse(await safeJson(c));
    if (!input.success) return apiError(c, 400, "invalid_check", "Invalid quality gate check");
    const checked = await checkEvaluationRuns(
      deps.clickhouse,
      deps.postgres.db,
      key.project.id,
      input.data,
      c.req.param("gateId"),
    );
    if (!checked.ok) {
      return apiError(c, checked.error.status, checked.error.code, checked.error.message);
    }
    const evaluation = checked.comparison.gate;
    if (evaluation === null) throw new Error("Quality gate check did not produce a verdict");
    const response = {
      ...evaluation,
      candidateRunId: input.data.candidateRunId,
      baselineRunId: input.data.baselineRunId,
    };
    await recordQualityGateAlert(deps.postgres, key.project.id, response).catch((error: unknown) =>
      deps.logger.warn({ err: error, projectId: key.project.id }, "failed to record gate alert"),
    );
    recordProjectKeyUsage(deps, key.apiKeyId, key.project.id);
    return c.json(response);
  });
