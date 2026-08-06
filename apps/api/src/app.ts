import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { createApiKeysRouter } from "./modules/api-keys/router.js";
import { createAuthRouter, createSetupRouter } from "./modules/auth/router.js";
import { createSessionMiddleware } from "./modules/auth/services.js";
import { createIngestionRouter } from "./modules/ingestion/router.js";
import { createInvitationsRouter } from "./modules/invitations/router.js";
import { createLlmModelsRouter } from "./modules/llm-models/router.js";
import { createMembersRouter } from "./modules/members/router.js";
import { createMetricsRouter } from "./modules/metrics/router.js";
import { createProjectsRouter } from "./modules/projects/router.js";
import { createSessionsRouter } from "./modules/sessions/router.js";
import { createSystemRouter } from "./modules/system/router.js";
import { createTracesRouter } from "./modules/traces/router.js";
import { createIngestionMetrics } from "./utils/metrics.js";
import type { ApiDependencies, AppEnv } from "./utils/types.js";

export type { ApiDependencies } from "./utils/types.js";

export function createApp(deps: ApiDependencies) {
  const metrics = createIngestionMetrics();

  return new Hono<AppEnv>()
    .use("*", requestId())
    .use(
      "/api/*",
      cors({
        origin: deps.config.WEB_ORIGIN,
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        credentials: true,
        maxAge: 600,
      }),
    )
    .route("/", createSystemRouter(deps, metrics))
    .route("/api/public/setup", createSetupRouter(deps))
    .route("/api/public/invitations", createInvitationsRouter(deps))
    .route("/api/auth", createAuthRouter(deps))
    .route("/api/public/otel/v1/traces", createIngestionRouter(deps, metrics))
    .use("/api/v1/*", createSessionMiddleware(deps))
    .route("/api/v1/members", createMembersRouter(deps))
    .route("/api/v1/llm-models", createLlmModelsRouter(deps))
    .route("/api/v1/projects", createProjectsRouter(deps))
    .route("/api/v1/projects", createApiKeysRouter(deps))
    .route("/api/v1/projects", createTracesRouter(deps))
    .route("/api/v1/projects", createSessionsRouter(deps))
    .route("/api/v1/projects", createMetricsRouter(deps));
}
