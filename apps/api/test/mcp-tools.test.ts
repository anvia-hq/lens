import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLensMcpServer, type McpPrincipal } from "../src/modules/mcp/tools.js";
import { createApiMetrics } from "../src/utils/metrics.js";
import type { ApiDependencies } from "../src/utils/types.js";

const db = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSpan: vi.fn(),
  getTrace: vi.fn(),
  listAlertIncidents: vi.fn(),
  listSessions: vi.fn(),
  listTraces: vi.fn(),
  queryMetrics: vi.fn(),
  projectRow: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@lens/db", () => ({ ...db, project: {} }));
vi.mock("../src/modules/alerts/services.js", () => ({ loadAlertIncidentDetail: vi.fn() }));

const PROJECT = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Support",
  slug: "support",
  state: "active",
};

const postgresDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => (db.projectRow === undefined ? [] : [db.projectRow]),
        orderBy: async () =>
          db.projectRow === undefined
            ? []
            : [{ id: db.projectRow.id, name: db.projectRow.name, slug: db.projectRow.slug }],
      }),
    }),
  }),
};

const deps = {
  config: { PUBLIC_APP_URL: "https://lens.example.com" },
  clickhouse: {},
  postgres: { db: postgresDb },
  logger: { info: vi.fn(), error: vi.fn() },
} as unknown as ApiDependencies;

const basePrincipal: McpPrincipal = {
  tokenId: "token-1",
  allowRawPayloads: false,
};

const connections: Array<{ client: Client; server: ReturnType<typeof createLensMcpServer> }> = [];

beforeEach(() => {
  db.projectRow = { ...PROJECT };
});

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    connections
      .splice(0)
      .map(({ client, server }) => Promise.all([client.close(), server.close()])),
  );
});

describe("Lens MCP tools", () => {
  it("advertises the read-only diagnosis tool set including project discovery", async () => {
    const { client } = await connect(basePrincipal);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_projects",
      "get_overview",
      "search_traces",
      "get_trace",
      "get_span",
      "search_sessions",
      "get_session",
      "list_alerts",
      "get_alert",
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("lists active projects without echoing a selected project", async () => {
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({ name: "list_projects", arguments: {} });
    const structured = result.structuredContent as {
      project: unknown;
      webUrl: unknown;
      data: { projects: Array<{ id: string; name: string; slug: string }> };
    };
    expect(structured.project).toBeNull();
    expect(structured.webUrl).toBeNull();
    expect(structured.data.projects).toEqual([
      { id: PROJECT.id, name: "Support", slug: "support" },
    ]);
  });

  it("rejects data tool calls for an unknown project", async () => {
    db.projectRow = undefined;
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_overview",
      arguments: { projectId: "20000000-0000-4000-8000-000000000009" },
    });
    expect(result.isError).toBe(true);
    expect(textResult(result)).toContain("not_found");
    expect(textResult(result)).toContain("Project not found");
    expect(db.queryMetrics).not.toHaveBeenCalled();
  });

  it("rejects data tool calls for a project that is not active", async () => {
    db.projectRow = { ...PROJECT, state: "deleting" };
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_overview",
      arguments: { projectId: PROJECT.id },
    });
    expect(result.isError).toBe(true);
    expect(textResult(result)).toContain("not_found");
    expect(db.queryMetrics).not.toHaveBeenCalled();
  });

  it("resolves the requested project for the overview", async () => {
    db.queryMetrics.mockResolvedValue({ errorRate: 0 });
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_overview",
      arguments: { projectId: PROJECT.id },
    });
    expect(db.queryMetrics).toHaveBeenCalledWith(deps.clickhouse, PROJECT.id, "24h");
    const structured = result.structuredContent as {
      project: { id: string; name: string; slug: string };
      webUrl: string;
      data: Record<string, unknown>;
    };
    expect(structured.project).toEqual({ id: PROJECT.id, name: "Support", slug: "support" });
    expect(structured.webUrl).toBe(`https://lens.example.com/${PROJECT.id}`);
  });

  it("rejects payload requests before loading span data when the token lacks permission", async () => {
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_span",
      arguments: {
        projectId: PROJECT.id,
        traceId: "trace-1",
        spanId: "span-1",
        includePayload: true,
      },
    });
    expect(result.isError).toBe(true);
    expect(textResult(result)).toContain("payload_access_denied");
    expect(db.getSpan).not.toHaveBeenCalled();
  });

  it("returns operational span fields by default and bounded raw fields on explicit opt-in", async () => {
    db.getSpan.mockResolvedValue({
      traceId: "trace-1",
      spanId: "span-1",
      name: "generate",
      status: "ok",
      resourceAttributes: { service: "support" },
      spanAttributes: { prompt: "x".repeat(70_000) },
      events: [],
      links: [],
      input: { message: "hello" },
      output: { message: "hi" },
    });
    const { client } = await connect({ ...basePrincipal, allowRawPayloads: true });

    const summary = await client.callTool({
      name: "get_span",
      arguments: { projectId: PROJECT.id, traceId: "trace-1", spanId: "span-1" },
    });
    const summaryData = structuredData(summary);
    expect(summaryData.payloadIncluded).toBe(false);
    expect(summaryData).not.toHaveProperty("payload");
    expect(db.getSpan).toHaveBeenLastCalledWith(deps.clickhouse, PROJECT.id, "trace-1", "span-1", {
      includePayloads: false,
    });

    const raw = await client.callTool({
      name: "get_span",
      arguments: {
        projectId: PROJECT.id,
        traceId: "trace-1",
        spanId: "span-1",
        includePayload: true,
      },
    });
    const rawData = structuredData(raw);
    expect(rawData.payloadIncluded).toBe(true);
    expect(rawData.payload).toMatchObject({
      input: { message: "hello" },
      spanAttributes: { truncated: true },
    });
    expect(db.getSpan).toHaveBeenLastCalledWith(deps.clickhouse, PROJECT.id, "trace-1", "span-1", {
      includePayloads: true,
    });
  });

  it("bounds trace reads and excludes evaluation payloads by default", async () => {
    db.getTrace.mockResolvedValue({
      summary: { traceId: "trace-1", spanCount: 900 },
      spans: [{ traceId: "trace-1", spanId: "span-1" }],
      evaluations: [],
    });
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_trace",
      arguments: { projectId: PROJECT.id, traceId: "trace-1" },
    });
    expect(db.getTrace).toHaveBeenCalledWith(deps.clickhouse, PROJECT.id, "trace-1", {
      spanLimit: 500,
      includeEvaluationPayloads: false,
    });
    expect(structuredData(result)).toMatchObject({ spansOmitted: 899, payloadIncluded: false });
  });

  it("defaults searches to a bounded 24-hour range", async () => {
    db.listTraces.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 });
    const { client } = await connect(basePrincipal);
    await client.callTool({ name: "search_traces", arguments: { projectId: PROJECT.id } });
    const options = db.listTraces.mock.calls[0]?.[2] as { from: string; to: string };
    expect(Date.parse(options.to) - Date.parse(options.from)).toBe(24 * 60 * 60 * 1_000);
  });

  it("does not load or expose session turns unless payloads are explicitly requested", async () => {
    db.getSession.mockResolvedValue({
      summary: { sessionId: "session-1" },
      traces: [{ traceId: "trace-1" }],
      turns: [{ trace: { traceId: "trace-1" }, prompt: { value: "secret" }, response: null }],
      nextCursor: null,
    });
    const { client } = await connect(basePrincipal);
    const result = await client.callTool({
      name: "get_session",
      arguments: { projectId: PROJECT.id, sessionId: "session-1" },
    });
    expect(db.getSession).toHaveBeenCalledWith(
      deps.clickhouse,
      PROJECT.id,
      "session-1",
      expect.objectContaining({ includeTurns: false }),
    );
    expect(structuredData(result)).toMatchObject({
      turns: [],
      turnsOmitted: true,
      payloadIncluded: false,
    });
  });
});

async function connect(principal: McpPrincipal) {
  const metrics = createApiMetrics();
  const server = createLensMcpServer(deps, metrics, principal);
  const client = new Client({ name: "lens-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  connections.push({ client, server });
  return { client, server };
}

function textResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content[0];
  return content?.type === "text" ? content.text : "";
}

function structuredData(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  return (result.structuredContent as { data: Record<string, unknown> }).data;
}
