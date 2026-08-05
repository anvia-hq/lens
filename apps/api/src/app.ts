import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { ClickHouseClient } from "@clickhouse/client";
import type { LensConfig } from "@lens/config";
import {
  createApiKeySchema,
  createProjectSchema,
  type Project,
  type ProjectApiKey,
  projectSettingsSchema,
  type TraceFilters,
} from "@lens/contracts";
import {
  getSession,
  getTrace,
  invitation,
  type LensPostgres,
  listSessions,
  listTraces,
  member,
  organization,
  type PostgresConnection,
  project,
  projectApiKey,
  queryMetrics,
  user,
} from "@lens/db";
import type { LensQueues } from "@lens/queue";
import {
  decodeOtlpRequest,
  encodeOtlpResponse,
  normalizeOtlpRequest,
  parseOtlpContentType,
} from "@lens/telemetry";
import { and, asc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type IORedis from "ioredis";
import { Counter, Histogram, Registry } from "prom-client";
import type { LensAuth } from "./auth.js";
import { createIngestionKey, ingestionKeyPrefix, verifyIngestionKey } from "./security.js";

const gunzipAsync = promisify(gunzip);

type SessionValue = Awaited<ReturnType<LensAuth["api"]["getSession"]>>;
type SessionUser = NonNullable<SessionValue>["user"];
type AppEnv = {
  Variables: {
    session: SessionValue;
  };
};

export type ApiDependencies = {
  config: LensConfig;
  postgres: PostgresConnection;
  clickhouse: ClickHouseClient;
  redis: IORedis;
  queues: LensQueues;
  auth: LensAuth;
};

type ProjectAccess = {
  project: typeof project.$inferSelect;
  role: string;
};

export function createApp(deps: ApiDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const metrics = createMetrics();

  app.use("*", requestId());
  app.use(
    "/api/*",
    cors({
      origin: deps.config.WEB_ORIGIN,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.get("/health/live", (c) => c.json({ status: "ok" }));
  app.get("/health/ready", async (c) => {
    try {
      await Promise.all([deps.postgres.sql`SELECT 1`, deps.redis.ping(), deps.clickhouse.ping()]);
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
  });
  app.get("/internal/metrics", async (c) => {
    c.header("Content-Type", metrics.registry.contentType);
    return c.body(await metrics.registry.metrics());
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  app.post("/v1/traces", async (c) => {
    const startedAt = performance.now();
    const contentType = parseOtlpContentType(c.req.header("content-type"));
    if (contentType === undefined) {
      metrics.rejected.inc({ reason: "content_type" });
      return apiError(
        c,
        415,
        "unsupported_media_type",
        "Use application/json or application/x-protobuf",
      );
    }
    const authorization = c.req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
    if (token === undefined)
      return apiError(c, 401, "unauthorized", "A project ingestion key is required");
    const key = await authenticateIngestionKey(
      deps.postgres.db,
      token,
      deps.config.INGESTION_KEY_PEPPER,
    );
    if (key === undefined || key.project.state !== "active") {
      metrics.rejected.inc({ reason: "auth" });
      return apiError(c, 401, "unauthorized", "Invalid or revoked ingestion key");
    }
    if (
      !(await withinRateLimit(deps.redis, key.project.id, deps.config.OTLP_RATE_LIMIT_PER_MINUTE))
    ) {
      metrics.rejected.inc({ reason: "rate_limit" });
      c.header("Retry-After", "60");
      return apiError(c, 429, "rate_limited", "Project ingestion rate limit exceeded");
    }

    let bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > deps.config.OTLP_MAX_BODY_BYTES) {
      return apiError(
        c,
        413,
        "payload_too_large",
        "OTLP request exceeds the configured body limit",
      );
    }
    if (c.req.header("content-encoding")?.toLowerCase() === "gzip") {
      try {
        bytes = new Uint8Array(await gunzipAsync(bytes));
      } catch {
        return apiError(c, 400, "invalid_gzip", "Unable to decompress request body");
      }
      if (bytes.byteLength > deps.config.OTLP_MAX_BODY_BYTES) {
        return apiError(
          c,
          413,
          "payload_too_large",
          "Decompressed OTLP request exceeds the body limit",
        );
      }
    }

    try {
      const request = decodeOtlpRequest(bytes, contentType);
      const retentionDays = parseRetentionDays(key.project.retentionDays);
      const normalized = normalizeOtlpRequest(request, {
        projectId: key.project.id,
        retentionDays,
        redactionPatterns: key.project.redactionPatterns,
      });
      if (normalized.spans.length > 0) {
        const ingestId = createHash("sha256").update(key.project.id).update(bytes).digest("hex");
        await deps.queues.ingest.add(
          "ingest",
          {
            projectId: key.project.id,
            ingestId,
            receivedAt: new Date().toISOString(),
            spans: normalized.spans,
          },
          { jobId: `ingest-${ingestId}` },
        );
        metrics.accepted.inc(normalized.spans.length);
      }
      if (normalized.rejectedSpans > 0) {
        metrics.rejected.inc({ reason: "invalid_span" }, normalized.rejectedSpans);
      }
      void deps.postgres.db
        .update(projectApiKey)
        .set({ lastUsedAt: new Date() })
        .where(eq(projectApiKey.id, key.apiKeyId));
      metrics.duration.observe((performance.now() - startedAt) / 1_000);
      const response = encodeOtlpResponse(
        contentType,
        normalized.rejectedSpans,
        normalized.errors.slice(0, 3).join("; "),
      );
      return new Response(response as BodyInit, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    } catch (error) {
      metrics.rejected.inc({ reason: "decode" });
      return apiError(
        c,
        400,
        "invalid_otlp",
        error instanceof Error ? error.message : "Invalid OTLP request",
      );
    }
  });

  app.use("/api/v1/*", async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (session === null) return apiError(c, 401, "unauthorized", "Sign in is required");
    c.set("session", session);
    await next();
  });

  app.get("/api/v1/team", async (c) => {
    const session = requiredSession(c);
    const team = await ensureDefaultTeam(deps.postgres.db, session.user);

    const members = await deps.postgres.db
      .select({
        id: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        createdAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, team.organization.id));
    const invitations = canManage(team.membership.role)
      ? await deps.postgres.db
          .select({
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            createdAt: invitation.createdAt,
          })
          .from(invitation)
          .where(eq(invitation.organizationId, team.organization.id))
      : [];

    return c.json({
      organizationId: team.organization.id,
      role: team.membership.role,
      canManage: canManage(team.membership.role),
      members: members.map((row) => ({
        ...row,
        isCurrentUser: row.userId === session.user.id,
        createdAt: row.createdAt.toISOString(),
      })),
      invitations: invitations.map((row) => ({
        ...row,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  app.patch("/api/v1/team/members/:memberId", async (c) => {
    const session = requiredSession(c);
    const team = await ensureDefaultTeam(deps.postgres.db, session.user);
    if (!canManage(team.membership.role))
      return apiError(c, 403, "forbidden", "Admin access is required");
    const body = await safeJson(c);
    const role = body?.role;
    if (role !== "admin" && role !== "member") {
      return apiError(c, 400, "invalid_role", "Role must be admin or member");
    }
    const [target] = await deps.postgres.db
      .select()
      .from(member)
      .where(
        and(
          eq(member.id, c.req.param("memberId")),
          eq(member.organizationId, team.organization.id),
        ),
      )
      .limit(1);
    if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
    if (target.role === "owner")
      return apiError(c, 403, "owner_protected", "The team owner role cannot be changed");
    const [updated] = await deps.postgres.db
      .update(member)
      .set({ role })
      .where(eq(member.id, target.id))
      .returning();
    return c.json({ id: updated?.id, role: updated?.role });
  });

  app.delete("/api/v1/team/members/:memberId", async (c) => {
    const session = requiredSession(c);
    const team = await ensureDefaultTeam(deps.postgres.db, session.user);
    if (!canManage(team.membership.role))
      return apiError(c, 403, "forbidden", "Admin access is required");
    const [target] = await deps.postgres.db
      .select()
      .from(member)
      .where(
        and(
          eq(member.id, c.req.param("memberId")),
          eq(member.organizationId, team.organization.id),
        ),
      )
      .limit(1);
    if (target === undefined) return apiError(c, 404, "not_found", "Member not found");
    if (target.role === "owner")
      return apiError(c, 403, "owner_protected", "The team owner cannot be removed");
    if (target.userId === session.user.id)
      return apiError(c, 403, "self_removal", "The current user cannot remove themselves");
    await deps.postgres.db.delete(member).where(eq(member.id, target.id));
    return c.body(null, 204);
  });

  app.get("/api/v1/invitations/:invitationId", async (c) => {
    const session = requiredSession(c);
    const [row] = await deps.postgres.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        organizationId: organization.id,
        organizationName: organization.name,
      })
      .from(invitation)
      .innerJoin(organization, eq(invitation.organizationId, organization.id))
      .where(eq(invitation.id, c.req.param("invitationId")))
      .limit(1);
    if (row === undefined) return apiError(c, 404, "not_found", "Invitation not found");
    if (row.email.toLowerCase() !== session.user.email.toLowerCase()) {
      const membership = await organizationMembership(
        deps.postgres.db,
        row.organizationId,
        session.user.id,
      );
      if (!canManage(membership?.role))
        return apiError(c, 403, "forbidden", "This invitation belongs to another user");
    }
    return c.json({ ...row, expiresAt: row.expiresAt.toISOString() });
  });

  app.get("/api/v1/projects", async (c) => {
    const session = requiredSession(c);
    const team = await ensureDefaultTeam(deps.postgres.db, session.user);
    const rows = await deps.postgres.db
      .select()
      .from(project)
      .where(eq(project.organizationId, team.organization.id));
    return c.json({
      items: rows.map((row) => ({ ...projectFromRow(row), role: team.membership.role })),
    });
  });

  app.post("/api/v1/projects", async (c) => {
    const session = requiredSession(c);
    const parsed = createProjectSchema.safeParse(await safeJson(c));
    if (!parsed.success) return apiError(c, 400, "invalid_project", "Invalid project data");
    const team = await ensureDefaultTeam(deps.postgres.db, session.user);
    if (!canManage(team.membership.role))
      return apiError(c, 403, "forbidden", "Admin access is required");
    const [created] = await deps.postgres.db
      .insert(project)
      .values({
        organizationId: team.organization.id,
        name: parsed.data.name,
        slug: parsed.data.slug,
      })
      .returning();
    if (created === undefined) return apiError(c, 500, "create_failed", "Project was not created");
    return c.json(projectFromRow(created), 201);
  });

  app.patch("/api/v1/projects/:projectId/settings", async (c) => {
    const access = await requireProjectAccess(
      deps.postgres.db,
      c.req.param("projectId"),
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
    const parsed = projectSettingsSchema.safeParse(await safeJson(c));
    if (!parsed.success) return apiError(c, 400, "invalid_settings", "Invalid project settings");
    const [updated] = await deps.postgres.db
      .update(project)
      .set({
        retentionDays:
          parsed.data.retentionDays === null ? "unlimited" : String(parsed.data.retentionDays),
        redactionPatterns: parsed.data.redactionPatterns,
        updatedAt: new Date(),
      })
      .where(eq(project.id, access.project.id))
      .returning();
    await deps.queues.maintenance.add("reconcile-retention", {
      projectId: access.project.id,
      retentionDays: parsed.data.retentionDays,
    });
    if (updated === undefined) return apiError(c, 500, "update_failed", "Project was not updated");
    return c.json(projectFromRow(updated));
  });

  app.delete("/api/v1/projects/:projectId", async (c) => {
    const access = await requireProjectAccess(
      deps.postgres.db,
      c.req.param("projectId"),
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
    await deps.postgres.db.transaction(async (tx) => {
      await tx
        .update(project)
        .set({ state: "deleting", updatedAt: new Date() })
        .where(eq(project.id, access.project.id));
      await tx
        .update(projectApiKey)
        .set({ revokedAt: new Date() })
        .where(eq(projectApiKey.projectId, access.project.id));
    });
    await deps.queues.maintenance.add("delete-project", { projectId: access.project.id });
    return c.body(null, 202);
  });

  app.get("/api/v1/projects/:projectId/keys", async (c) => {
    const access = await requireProjectAccess(
      deps.postgres.db,
      c.req.param("projectId"),
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
    const rows = await deps.postgres.db
      .select()
      .from(projectApiKey)
      .where(eq(projectApiKey.projectId, access.project.id));
    return c.json({ items: rows.map(apiKeyFromRow) });
  });

  app.post("/api/v1/projects/:projectId/keys", async (c) => {
    const session = requiredSession(c);
    const access = await requireProjectAccess(
      deps.postgres.db,
      c.req.param("projectId"),
      session.user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
    const parsed = createApiKeySchema.safeParse(await safeJson(c));
    if (!parsed.success) return apiError(c, 400, "invalid_key", "A key name is required");
    const generated = createIngestionKey(deps.config.INGESTION_KEY_PEPPER);
    const [created] = await deps.postgres.db
      .insert(projectApiKey)
      .values({
        projectId: access.project.id,
        name: parsed.data.name,
        prefix: generated.prefix,
        secretHash: generated.hash,
        createdBy: session.user.id,
      })
      .returning();
    if (created === undefined)
      return apiError(c, 500, "create_failed", "Ingestion key was not created");
    return c.json({ ...apiKeyFromRow(created), key: generated.key }, 201);
  });

  app.delete("/api/v1/projects/:projectId/keys/:keyId", async (c) => {
    const access = await requireProjectAccess(
      deps.postgres.db,
      c.req.param("projectId"),
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    if (!canManage(access.role)) return apiError(c, 403, "forbidden", "Admin access is required");
    await deps.postgres.db
      .update(projectApiKey)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(projectApiKey.id, c.req.param("keyId")),
          eq(projectApiKey.projectId, access.project.id),
        ),
      );
    return c.body(null, 204);
  });

  app.get("/api/v1/projects/:projectId/traces", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const filters = traceFilters(c);
    const page = await listTraces(deps.clickhouse, projectId, {
      ...filters,
      cursor: c.req.query("cursor"),
      limit: Number(c.req.query("limit") ?? 50),
    });
    return c.json(page);
  });

  app.get("/api/v1/projects/:projectId/traces/:traceId", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const trace = await getTrace(deps.clickhouse, projectId, c.req.param("traceId"));
    return trace === undefined ? apiError(c, 404, "not_found", "Trace not found") : c.json(trace);
  });

  app.get("/api/v1/projects/:projectId/sessions", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const items = await listSessions(deps.clickhouse, projectId, {
      from: c.req.query("from"),
      to: c.req.query("to"),
      search: c.req.query("search"),
      limit: Number(c.req.query("limit") ?? 50),
    });
    return c.json({ items });
  });

  app.get("/api/v1/projects/:projectId/sessions/:sessionId", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const session = await getSession(deps.clickhouse, projectId, c.req.param("sessionId"));
    return session === undefined
      ? apiError(c, 404, "not_found", "Session not found")
      : c.json(session);
  });

  app.get("/api/v1/projects/:projectId/metrics", async (c) => {
    const projectId = c.req.param("projectId");
    const access = await requireProjectAccess(
      deps.postgres.db,
      projectId,
      requiredSession(c).user.id,
    );
    if (access === undefined) return apiError(c, 404, "not_found", "Project not found");
    const to = c.req.query("to") ?? new Date().toISOString();
    const from = c.req.query("from") ?? new Date(Date.now() - 86_400_000).toISOString();
    return c.json(await queryMetrics(deps.clickhouse, projectId, from, to));
  });

  return app;
}

function createMetrics() {
  const registry = new Registry();
  const accepted = new Counter({
    name: "lens_ingest_spans_accepted_total",
    help: "Accepted OTLP spans",
    registers: [registry],
  });
  const rejected = new Counter({
    name: "lens_ingest_spans_rejected_total",
    help: "Rejected OTLP requests or spans",
    labelNames: ["reason"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: "lens_ingest_duration_seconds",
    help: "OTLP request acceptance latency",
    registers: [registry],
  });
  return { registry, accepted, rejected, duration };
}

function requiredSession(c: Context<AppEnv>): NonNullable<SessionValue> {
  const session = c.get("session");
  if (session === null) throw new Error("Session middleware invariant failed");
  return session;
}

async function organizationMembership(db: LensPostgres, organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return row;
}

async function defaultTeam(db: LensPostgres, userId: string) {
  const [row] = await db
    .select({ membership: member, organization })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return row;
}

async function ensureDefaultTeam(db: LensPostgres, user: SessionUser) {
  const existing = await defaultTeam(db, user.id);
  if (existing !== undefined) return existing;

  const organizationId = randomUUID();
  const slug = `lens-${createHash("sha256").update(user.id).digest("hex").slice(0, 16)}`;
  await db.transaction(async (tx) => {
    await tx.insert(organization).values({
      id: organizationId,
      name: `${user.name}'s Team`,
      slug,
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId: user.id,
      role: "owner",
    });
  });
  const created = await defaultTeam(db, user.id);
  if (created === undefined) throw new Error("Default team was not created");
  return created;
}

async function requireProjectAccess(
  db: LensPostgres,
  projectId: string,
  userId: string,
): Promise<ProjectAccess | undefined> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return undefined;
  }
  const [row] = await db
    .select({ project, role: member.role })
    .from(project)
    .innerJoin(member, eq(project.organizationId, member.organizationId))
    .where(and(eq(project.id, projectId), eq(member.userId, userId)))
    .limit(1);
  return row;
}

function canManage(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

async function authenticateIngestionKey(db: LensPostgres, token: string, pepper: string) {
  const prefix = ingestionKeyPrefix(token);
  if (prefix === undefined) return undefined;
  const [row] = await db
    .select({
      apiKeyId: projectApiKey.id,
      secretHash: projectApiKey.secretHash,
      revokedAt: projectApiKey.revokedAt,
      project,
    })
    .from(projectApiKey)
    .innerJoin(project, eq(projectApiKey.projectId, project.id))
    .where(eq(projectApiKey.prefix, prefix))
    .limit(1);
  if (
    row === undefined ||
    row.revokedAt !== null ||
    !verifyIngestionKey(token, row.secretHash, pepper)
  ) {
    return undefined;
  }
  return row;
}

async function withinRateLimit(redis: IORedis, projectId: string, limit: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `lens:rate:${projectId}:${bucket}`;
  const result = await redis.multi().incr(key).expire(key, 120).exec();
  const count = Number(result?.[0]?.[1] ?? limit + 1);
  return count <= limit;
}

function projectFromRow(row: typeof project.$inferSelect): Project {
  return {
    id: row.id,
    teamId: row.organizationId,
    name: row.name,
    slug: row.slug,
    state: row.state,
    settings: {
      retentionDays: parseRetentionDays(row.retentionDays),
      redactionPatterns: row.redactionPatterns,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function apiKeyFromRow(row: typeof projectApiKey.$inferSelect): ProjectApiKey {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function parseRetentionDays(value: string): 7 | 30 | 90 | null {
  if (value === "7") return 7;
  if (value === "90") return 90;
  if (value === "unlimited") return null;
  return 30;
}

function traceFilters(c: Context): TraceFilters {
  const filters: TraceFilters = {};
  for (const key of [
    "from",
    "to",
    "status",
    "service",
    "name",
    "model",
    "userId",
    "sessionId",
    "tag",
    "search",
  ] as const) {
    const value = c.req.query(key);
    if (value !== undefined && value.length > 0) Object.assign(filters, { [key]: value });
  }
  return filters;
}

async function safeJson(c: Context): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await c.req.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function apiError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status);
}
