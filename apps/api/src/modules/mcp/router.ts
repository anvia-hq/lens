import { mcpToken } from "@lens/db";
import { type AuthInfo, createMcpHandler } from "@modelcontextprotocol/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ApiMetrics } from "../../utils/metrics.js";
import { withinFixedWindowRateLimit } from "../../utils/rate-limit.js";
import { hashMcpToken, parseBearerAuthorization } from "../../utils/security.js";
import type { ApiDependencies, AppEnv } from "../../utils/types.js";
import { createLensMcpServer, type McpPrincipal } from "./tools.js";

export function createMcpRouter(deps: ApiDependencies, metrics: ApiMetrics) {
  const handler = createMcpHandler(
    (context) => {
      const principal = principalFromAuth(context.authInfo);
      return createLensMcpServer(deps, metrics, principal);
    },
    {
      legacy: "stateless",
      responseMode: "auto",
      onerror: (error) => deps.logger.error({ err: error }, "MCP transport failed"),
    },
  );

  const router = new Hono<AppEnv>();
  const serve = async (c: Context<AppEnv>) => {
    const rejected = validatePublicRequest(c, deps);
    if (rejected !== undefined) return tracked(metrics, rejected);
    const token = parseBearerAuthorization(c.req.header("authorization"));
    if (token === undefined) return tracked(metrics, unauthorized(c));
    const authenticated = await authenticateMcpToken(deps, token);
    if (authenticated === undefined) return tracked(metrics, unauthorized(c));
    if (
      !(await withinFixedWindowRateLimit(
        deps.redis,
        "mcp",
        authenticated.principal.tokenId,
        deps.config.MCP_RATE_LIMIT_PER_MINUTE,
      ))
    ) {
      c.header("Retry-After", "60");
      return tracked(
        metrics,
        c.json({ error: "rate_limited", message: "MCP request rate limit exceeded" }, 429),
      );
    }
    recordTokenUsage(deps, authenticated.principal);
    const response = await handler.fetch(c.req.raw, { authInfo: authenticated.authInfo });
    return tracked(metrics, response);
  };
  router.all("/", serve).all("", serve);
  return router;
}

async function authenticateMcpToken(deps: ApiDependencies, token: string) {
  const tokenHash = hashMcpToken(token, deps.config.INGESTION_KEY_PEPPER);
  const [row] = await deps.postgres.db
    .select()
    .from(mcpToken)
    .where(eq(mcpToken.tokenHash, tokenHash))
    .limit(1);
  if (
    row === undefined ||
    row.revokedAt !== null ||
    (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now())
  ) {
    return undefined;
  }
  const principal: McpPrincipal = {
    tokenId: row.id,
    allowRawPayloads: row.allowRawPayloads,
  };
  const endpoint = new URL("/api/mcp", deps.config.PUBLIC_APP_URL);
  const authInfo: AuthInfo = {
    token,
    clientId: row.id,
    scopes: row.allowRawPayloads ? ["observability:read", "payloads:read"] : ["observability:read"],
    expiresAt: row.expiresAt ? Math.floor(row.expiresAt.getTime() / 1_000) : undefined,
    resource: endpoint,
    extra: { principal },
  };
  return { authInfo, principal };
}

function principalFromAuth(authInfo: AuthInfo | undefined): McpPrincipal {
  const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
  if (
    principal === undefined ||
    typeof principal.tokenId !== "string" ||
    typeof principal.allowRawPayloads !== "boolean"
  ) {
    throw new Error("Authenticated MCP principal is missing");
  }
  return principal;
}

function validatePublicRequest(c: Context<AppEnv>, deps: ApiDependencies): Response | undefined {
  const allowedUrls = [new URL(deps.config.PUBLIC_APP_URL), new URL(deps.config.WEB_ORIGIN)];
  const origin = c.req.header("origin");
  if (origin !== undefined && !allowedUrls.some((url) => url.origin === origin)) {
    return c.json({ error: "forbidden_origin", message: "Origin is not allowed" }, 403);
  }
  const host = c.req.header("host")?.toLowerCase();
  const allowedHosts = new Set(
    allowedUrls.flatMap((url) => [url.host.toLowerCase(), url.hostname.toLowerCase()]),
  );
  if (deps.config.NODE_ENV !== "production") {
    allowedHosts.add(`localhost:${deps.config.API_PORT}`);
    allowedHosts.add(`127.0.0.1:${deps.config.API_PORT}`);
    allowedHosts.add("localhost");
    allowedHosts.add("127.0.0.1");
  }
  if (host === undefined || !allowedHosts.has(host)) {
    return c.json({ error: "forbidden_host", message: "Host is not allowed" }, 403);
  }
  return undefined;
}

function recordTokenUsage(deps: ApiDependencies, principal: McpPrincipal): void {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  void deps.postgres.db
    .update(mcpToken)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(mcpToken.id, principal.tokenId),
        or(isNull(mcpToken.lastUsedAt), lt(mcpToken.lastUsedAt, staleBefore)),
      ),
    )
    .catch((error: unknown) =>
      deps.logger.warn(
        { err: error, tokenId: principal.tokenId },
        "failed to record MCP token usage",
      ),
    );
}

function unauthorized(c: Context<AppEnv>) {
  c.header("WWW-Authenticate", 'Bearer realm="Lens MCP"');
  return c.json({ error: "unauthorized", message: "A valid Lens MCP token is required" }, 401);
}

function tracked(metrics: ApiMetrics, response: Response): Response {
  metrics.mcpHttpRequests.labels(String(response.status)).inc();
  return response;
}
