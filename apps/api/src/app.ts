import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { createAlertsRouter } from "./modules/alerts/router.js";
import { createApiKeysRouter } from "./modules/api-keys/router.js";
import { createAuthRouter, createSetupRouter } from "./modules/auth/router.js";
import { createSessionMiddleware } from "./modules/auth/services.js";
import { createDataDeletionsRouter } from "./modules/data-deletions/router.js";
import { createEvaluationDatasetsRouter } from "./modules/evaluation-datasets/router.js";
import { createEvaluationRunsRouter } from "./modules/evaluation-runs/router.js";
import { createEvaluationsRouter } from "./modules/evaluations/router.js";
import { createLogsIngestionRouter } from "./modules/ingestion/logs-router.js";
import { createIngestionRouter } from "./modules/ingestion/router.js";
import { createInvitationsRouter } from "./modules/invitations/router.js";
import { createLlmModelsRouter } from "./modules/llm-models/router.js";
import { createPublicDatasetsRouter } from "./modules/managed-datasets/public-router.js";
import { createManagedDatasetsRouter } from "./modules/managed-datasets/router.js";
import { createMembersRouter } from "./modules/members/router.js";
import { createMetricsRouter } from "./modules/metrics/router.js";
import { createProjectsRouter } from "./modules/projects/router.js";
import { createPublicQualityGatesRouter } from "./modules/quality-gates/public-router.js";
import { createQualityGatesRouter } from "./modules/quality-gates/router.js";
import { createSessionsRouter } from "./modules/sessions/router.js";
import { createSystemHealthRouter } from "./modules/system/health-router.js";
import { createSystemRouter } from "./modules/system/router.js";
import { createTracesRouter } from "./modules/traces/router.js";
import { createUsersRouter } from "./modules/users/router.js";
import { apiError } from "./utils/http.js";
import { createIngestionMetrics } from "./utils/metrics.js";
import type { ApiDependencies, AppEnv } from "./utils/types.js";

export type { ApiDependencies } from "./utils/types.js";

export function createApp(deps: ApiDependencies) {
  const metrics = createIngestionMetrics();
  const app = new Hono<AppEnv>()
    .use("*", requestId())
    .use("*", async (c, next) => {
      const startedAt = performance.now();
      await next();
      deps.logger.info(
        {
          requestId: c.get("requestId"),
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
        "request completed",
      );
    })
    .use(
      "/api/*",
      cors({
        origin: deps.config.WEB_ORIGIN,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true,
        maxAge: 600,
      }),
    )
    .use("/api/v1/*", compress({ threshold: 1_024, contentTypeFilter: /^application\/json/ }))
    .route("/", createSystemRouter(deps, metrics))
    .route("/api/public/setup", createSetupRouter(deps))
    .route("/api/public/invitations", createInvitationsRouter(deps))
    .route("/api/auth", createAuthRouter(deps))
    .route("/api/public/otel/v1/traces", createIngestionRouter(deps, metrics))
    .route("/api/public/otel/v1/logs", createLogsIngestionRouter(deps, metrics))
    .route("/api/public/datasets", createPublicDatasetsRouter(deps))
    .route("/api/public/quality-gates", createPublicQualityGatesRouter(deps))
    .use("/api/v1/*", createSessionMiddleware(deps))
    .route("/api/v1/system", createSystemHealthRouter(deps))
    .route("/api/v1/members", createMembersRouter(deps))
    .route("/api/v1/llm-models", createLlmModelsRouter(deps))
    .route("/api/v1/projects", createProjectsRouter(deps))
    .route("/api/v1/projects", createApiKeysRouter(deps))
    .route("/api/v1/projects", createAlertsRouter(deps))
    .route("/api/v1/projects", createDataDeletionsRouter(deps))
    .route("/api/v1/projects", createTracesRouter(deps))
    .route("/api/v1/projects", createSessionsRouter(deps))
    .route("/api/v1/projects", createUsersRouter(deps))
    .route("/api/v1/projects", createMetricsRouter(deps))
    .route("/api/v1/projects", createEvaluationsRouter(deps))
    .route("/api/v1/projects", createManagedDatasetsRouter(deps))
    .route("/api/v1/projects", createEvaluationDatasetsRouter(deps))
    .route("/api/v1/projects", createEvaluationRunsRouter(deps))
    .route("/api/v1/projects", createQualityGatesRouter(deps));
  app.onError((error, c) => {
    deps.logger.error(
      {
        err: error,
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
      },
      "request failed",
    );
    return apiError(c, 500, "internal_error", "An unexpected error occurred");
  });
  return app;
}
