import { promptVersionCommitSchema, resolvedPromptSchema } from "@lens/contracts";
import { prompt, promptLabel, promptLabelEvent, promptVersion } from "@lens/db";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicPromptsRouter } from "../src/modules/prompts/public-router.js";
import { createPromptsRouter } from "../src/modules/prompts/router.js";
import type { ApiDependencies, AppEnv } from "../src/utils/types.js";

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const PROMPT_ID = "99999999-0000-4000-8000-000000000001";
const VERSION_ID = "99999999-0000-4000-8000-000000000002";
const access = vi.hoisted(() => ({ role: "owner" }));

vi.mock("../src/utils/access.js", () => ({
  requireProjectAccess: vi.fn(async (_db: unknown, projectId: string) =>
    projectId === "11111111-2222-4333-8444-555555555555"
      ? { project: { id: projectId, state: "active" }, role: access.role }
      : undefined,
  ),
  canManage: (role: string) => role === "owner" || role === "admin",
}));

const recordUsage = vi.fn();
vi.mock("../src/modules/ingestion/services.js", () => ({
  authenticateIngestionKey: vi.fn(async () => ({
    apiKeyId: "key-1",
    project: { id: "11111111-2222-4333-8444-555555555555", state: "active" },
  })),
  recordProjectKeyUsage: (...args: unknown[]) => recordUsage(...args),
}));

beforeEach(() => {
  access.role = "owner";
  recordUsage.mockClear();
});

describe("prompts router", () => {
  it("creates a prompt with version 1, labels, and label events", async () => {
    const { app, inserts } = promptApp((table) => {
      if (table === prompt) return [promptRow()];
      if (table === promptVersion) return [versionRow(1)];
      if (table === promptLabel) return [labelJoinRow(1)];
      return [];
    });
    const response = await app.request(`/${PROJECT_ID}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "support/reply",
        description: "Replies to tickets",
        content: { type: "text", template: "Answer {{question}}" },
        changeMessage: "Initial import",
        labels: ["production"],
      }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      name: string;
      latestVersion: number;
      versions: Array<{ version: number; type: string; changeMessage: string | null }>;
      labels: Array<{ label: string; version: number }>;
    };
    expect(body).toMatchObject({
      name: "support/reply",
      latestVersion: 1,
      labels: [{ label: "production", version: 1 }],
    });
    expect(body.versions[0]).toMatchObject({
      version: 1,
      type: "text",
      template: "Answer {{question}}",
      changeMessage: "Initial import",
    });
    const insertMap = inserts();
    expect(insertMap.find((row) => row.table === prompt)?.value).toMatchObject({
      projectId: PROJECT_ID,
      name: "support/reply",
      createdBy: "user-1",
    });
    expect(insertMap.find((row) => row.table === promptVersion)?.value).toMatchObject({
      promptId: PROMPT_ID,
      version: 1,
      type: "text",
      template: "Answer {{question}}",
      changeMessage: "Initial import",
    });
    expect(insertMap.find((row) => row.table === promptLabel)?.value).toMatchObject([
      {
        promptId: PROMPT_ID,
        label: "production",
        versionId: VERSION_ID,
        updatedBy: "user-1",
      },
    ]);
    expect(insertMap.find((row) => row.table === promptLabelEvent)?.value).toMatchObject([
      {
        label: "production",
        fromVersion: null,
        toVersion: 1,
        changedBy: "user-1",
      },
    ]);
  });

  it("rejects invalid prompt content with 400", async () => {
    const { app, inserts } = promptApp(() => []);
    const response = await app.request(`/${PROJECT_ID}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "broken", content: { type: "chat" } }),
    });
    expect(response.status).toBe(400);
    expect(inserts()).toHaveLength(0);
  });

  it.each([
    { type: "text" },
    { type: "text", template: "   " },
    { type: "text", template: "Valid", messages: [] },
    { type: "chat" },
    { type: "chat", messages: [] },
    { type: "chat", messages: [{ role: "user", content: "Hi" }], template: "" },
    { type: "chat", messages: [{ role: "invalid", content: "Hi" }] },
  ])("rejects invalid commits without writing: %j", async (content) => {
    expect(promptVersionCommitSchema.safeParse(content).success).toBe(false);
    const { app, inserts } = promptApp(() => []);
    const response = await app.request(`/${PROJECT_ID}/prompts/${PROMPT_ID}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    expect(response.status).toBe(400);
    expect(inserts()).toHaveLength(0);
  });

  it.each([
    { type: "text", template: "Hello {{name}}", config: { temperature: 0.2 } },
    { type: "chat", messages: [{ role: "user", content: "Hi", name: "visitor" }] },
  ])("commits valid content with its change message: %j", async (content) => {
    const { app, inserts } = promptApp((table) => {
      if (table === prompt) return [promptRow()];
      if (table === promptVersion) return [{ ...versionRow(2), value: 1 }];
      return [];
    });
    const response = await app.request(`/${PROJECT_ID}/prompts/${PROMPT_ID}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...content, changeMessage: "Update" }),
    });
    expect(response.status).toBe(201);
    expect(inserts().find((row) => row.table === promptVersion)?.value).toMatchObject({
      ...content,
      version: 2,
      changeMessage: "Update",
    });
  });

  it("requires an owner or admin to create prompts", async () => {
    access.role = "member";
    const { app, inserts } = promptApp(() => []);
    const response = await app.request(`/${PROJECT_ID}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "support/reply",
        content: { type: "text", template: "Hi" },
      }),
    });
    expect(response.status).toBe(403);
    expect(inserts()).toHaveLength(0);
  });

  it("rejects moving a label to an unknown version", async () => {
    const { app } = promptApp((table) => (table === prompt ? [promptRow()] : []));
    const response = await app.request(`/${PROJECT_ID}/prompts/${PROMPT_ID}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "production", version: 9 }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "unknown_version" } });
  });

  it("returns label deployment history", async () => {
    const { app } = promptApp((table) => {
      if (table === prompt) return [promptRow()];
      if (table === promptLabelEvent) return [eventRow()];
      return [];
    });
    const response = await app.request(
      `/${PROJECT_ID}/prompts/${PROMPT_ID}/history?label=production`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ label: "production", fromVersion: 4, toVersion: 5, changedBy: "user-1" }],
    });
  });
});

describe("public prompts router", () => {
  const auth = `Basic ${Buffer.from("pk-lens-test:sk-lens-test").toString("base64")}`;

  it("requires basic auth", async () => {
    const { app } = promptApp(() => []);
    const response = await app.request("/api/public/prompts/support-reply");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Basic realm="Lens prompts"');
  });

  it.each([
    "version=latest",
    "version=",
    "version=%20",
    "version=0",
    "version=-1",
    "version=1.5",
    "version=1e2",
    "version=9007199254740992",
    `version=${"9".repeat(400)}`,
    "label=",
    "label=%20",
    "label=production&version=1",
    "label=&version=1",
  ])("rejects invalid selectors: %s", async (query) => {
    const { app } = promptApp(() => []);
    const response = await app.request(`/api/public/prompts/support?${query}`, {
      headers: { authorization: auth },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_selector" } });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown prompt", async () => {
    const { app } = promptApp(() => []);
    const response = await app.request("/api/public/prompts/missing", {
      headers: { authorization: auth },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("returns 404 not_deployed when the label has no version", async () => {
    const { app } = promptApp((table) => (table === prompt ? [promptRow()] : []));
    const response = await app.request("/api/public/prompts/support-reply", {
      headers: { authorization: auth },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_deployed" } });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it("distinguishes an unknown explicit version from an undeployed label", async () => {
    const { app } = promptApp((table) => (table === prompt ? [promptRow()] : []));
    const response = await app.request("/api/public/prompts/support?version=99", {
      headers: { authorization: auth },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "unknown_version" } });
  });

  it.each([
    ["?label=staging", { label: "staging" }],
    ["?version=5", { version: 5 }],
  ])("resolves encoded slash names and reports the actual selector %s", async (query, selector) => {
    const messages = [{ role: "system", content: "Help {{name}}", name: "helper" }];
    const { app, conditions } = promptApp((table) => {
      if (table === prompt) return [promptRow()];
      if (table === promptVersion)
        return [{ ...versionRow(5), type: "chat", template: null, messages }];
      return [];
    });
    const response = await app.request(
      `/api/public/prompts/${encodeURIComponent("support/reply")}${query}`,
      {
        headers: { authorization: auth },
      },
    );
    expect(response.status).toBe(200);
    expect(
      conditions.slice(0, 1).flatMap((condition) => new PgDialect().sqlToQuery(condition).params),
    ).toContain("support/reply");
    const body: unknown = await response.json();
    expect(resolvedPromptSchema.parse(body)).toEqual({
      name: "support/reply",
      version: 5,
      selector,
      labels: [],
      config: {},
      type: "chat",
      template: null,
      messages,
    });
    expect(body).not.toHaveProperty("requestedLabel");
  });

  it("resolves the production deployment with the immutable version", async () => {
    const { app } = promptApp((table) => {
      if (table === prompt) return [promptRow()];
      if (table === promptVersion) return [versionRow(5)];
      if (table === promptLabel) return [{ label: "production" }];
      return [];
    });
    const response = await app.request("/api/public/prompts/support-reply", {
      headers: { authorization: auth },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "support/reply",
      version: 5,
      type: "text",
      template: "Answer {{question}}",
      selector: { label: "production" },
      labels: ["production"],
    });
    expect(recordUsage).toHaveBeenCalledOnce();
  });
});

type Route = (table: unknown) => unknown[];

describe("resolved prompt contract", () => {
  const text = {
    name: "support/reply",
    version: 1,
    config: {},
    labels: [],
    selector: { version: 1 },
    type: "text",
    template: "Hello",
    messages: null,
  };

  it("accepts unambiguous text and chat payloads", () => {
    expect(resolvedPromptSchema.parse(text)).toEqual(text);
    const chat = {
      ...text,
      type: "chat",
      template: null,
      messages: [{ role: "user", content: "Hi" }],
    };
    expect(resolvedPromptSchema.parse(chat)).toEqual(chat);
  });

  it.each([
    { messages: [] },
    { template: null },
    { type: "chat" },
    { template: " " },
    { version: 0 },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { selector: {} },
    { selector: { label: "production", version: 1 } },
  ])("rejects inconsistent runtime content or selectors: %j", (patch) => {
    expect(resolvedPromptSchema.safeParse({ ...text, ...patch }).success).toBe(false);
  });
});

function promptApp(route: Route) {
  const inserted: Array<{ table: unknown; value: unknown }> = [];
  const conditions: SQL[] = [];

  class FakeQuery {
    constructor(
      private readonly routeFn: Route,
      private readonly table: unknown,
    ) {}

    // biome-ignore lint/suspicious/noThenProperty: the stub must be thenable like real drizzle builders
    then(resolve: (rows: unknown[]) => unknown) {
      return Promise.resolve(this.routeFn(this.table)).then(resolve);
    }

    from(table: unknown) {
      return new FakeQuery(this.routeFn, table);
    }

    innerJoin() {
      return this;
    }

    leftJoin() {
      return this;
    }

    where(condition: SQL) {
      conditions.push(condition);
      return this;
    }

    orderBy() {
      return Object.assign(Promise.resolve(this.routeFn(this.table)), {
        limit: () => Promise.resolve(this.routeFn(this.table)),
      });
    }

    groupBy() {
      return this;
    }

    for() {
      return this;
    }

    set() {
      return this;
    }

    limit() {
      return Promise.resolve(this.routeFn(this.table));
    }

    returning() {
      return Promise.resolve(this.routeFn(this.table));
    }

    values(value: unknown) {
      inserted.push({ table: this.table, value });
      return { returning: () => Promise.resolve(this.routeFn(this.table)) };
    }
  }

  const db = {
    select: () => new FakeQuery(route, undefined),
    insert: (table: unknown) => new FakeQuery(route, table),
    update: (table: unknown) => new FakeQuery(route, table),
    delete: (table: unknown) => new FakeQuery(route, table),
    transaction: (callback: (tx: unknown) => unknown) => Promise.resolve(callback(db)),
  };

  const deps = {
    config: { INGESTION_KEY_PEPPER: "test-pepper" },
    postgres: { db },
    logger: { error: vi.fn() },
  } as unknown as ApiDependencies;

  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: "user-1" } } as never);
    await next();
  });
  app.route("/", createPromptsRouter(deps));
  app.route("/api/public/prompts", createPublicPromptsRouter(deps));
  return { app, conditions, inserts: () => inserted };
}

function promptRow() {
  return {
    id: PROMPT_ID,
    projectId: PROJECT_ID,
    name: "support/reply",
    description: "Replies to tickets",
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-05T00:00:00.000Z"),
  };
}

function versionRow(number: number) {
  return {
    id: VERSION_ID,
    promptId: PROMPT_ID,
    version: number,
    type: "text",
    template: "Answer {{question}}",
    messages: null,
    config: {},
    changeMessage: number === 1 ? "Initial import" : null,
    createdBy: "user-1",
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
  };
}

function labelJoinRow(version: number) {
  return {
    label: {
      label: "production",
      versionId: VERSION_ID,
      updatedBy: "user-1",
      updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    },
    version,
  };
}

function eventRow() {
  return {
    id: "event-1",
    promptId: PROMPT_ID,
    label: "production",
    fromVersion: 4,
    toVersion: 5,
    changedBy: "user-1",
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
  };
}
