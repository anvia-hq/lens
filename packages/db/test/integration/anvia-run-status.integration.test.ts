import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadConfig } from "@lens/config";
import type { NormalizedSpan } from "@lens/contracts";
import { decodeOtlpRequest, normalizeOtlpRequest } from "@lens/telemetry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyModelPrices,
  createClickHouse,
  deleteProjectTelemetry,
  getSession,
  getTraceSummary,
  insertSpans,
  listSessions,
  materializeTrace,
  recalculateModelCosts,
} from "../../src/index.js";
import { runMigrations } from "../../src/migration-runner.js";

type OtlpBody = {
  resourceSpans: Array<{
    scopeSpans: Array<{ spans: Array<{ name: string; parentSpanId?: string }> }>;
  }>;
};

/** One durable run as exported by `@anvia/lens`: OTLP request bodies grouped by flush. */
type Capture = { traceId: string; phases: OtlpBody[][] };

/**
 * OTLP/HTTP JSON bodies captured from `@anvia/durable` runs observed by `LensClient.observer()`.
 * `approval` and `approvalFailed` have two phases: the attempt that suspended for approval, then
 * the resumed attempt, which completes or fails.
 */
const captures = JSON.parse(
  readFileSync(new URL("../fixtures/anvia-durable-otlp.json", import.meta.url), "utf8"),
) as Record<
  "completed" | "failed" | "cancelled" | "retried" | "approval" | "approvalFailed",
  Capture
>;

/**
 * Two chats observed through one `LensClient`. The first chat (`chat-7f3a`, user-1) has two turns,
 * the second pausing for approval and resuming, a two-round goal, and a spawned subagent, each in
 * its own durable execution session. The second chat (`chat-91c2`, user-2) has one turn.
 */
const chatSession = JSON.parse(
  readFileSync(new URL("../fixtures/anvia-chat-session-otlp.json", import.meta.url), "utf8"),
) as OtlpBody[];

const legacyParent = "0000000000000001";

/** The same run as `@anvia/otel` 1.2.2 exported it: every run root points at a missing parent. */
function legacy(capture: Capture): Capture {
  const copy = structuredClone(capture);
  for (const span of copy.phases.flat().flatMap(spansOf)) {
    if (span.name === "agent.run") span.parentSpanId = legacyParent;
  }
  return copy;
}

function spansOf(body: OtlpBody) {
  return body.resourceSpans.flatMap((resource) => resource.scopeSpans.flatMap((s) => s.spans));
}

describe("Anvia durable run status", () => {
  const config = integrationConfig();
  const clickhouse = createClickHouse(config);
  const projects: string[] = [];

  beforeAll(async () => {
    await runMigrations(config);
  }, 30_000);

  afterAll(async () => {
    for (const projectId of projects) await deleteProjectTelemetry(clickhouse, projectId);
    await clickhouse.close();
  });

  function project(): string {
    const projectId = randomUUID();
    projects.push(projectId);
    return projectId;
  }

  function normalize(projectId: string, bodies: OtlpBody[]): NormalizedSpan[] {
    return bodies.flatMap((body) => {
      const request = decodeOtlpRequest(
        new TextEncoder().encode(JSON.stringify(body)),
        "application/json",
      );
      const result = normalizeOtlpRequest(request, { projectId, retentionDays: 30 });
      expect(result.errors).toEqual([]);
      return result.spans;
    });
  }

  /** Mirrors the worker: insert a flush's spans, then rematerialize the trace. */
  async function ingest(projectId: string, capture: Capture, phase: number) {
    await insertSpans(clickhouse, normalize(projectId, capture.phases[phase] ?? []));
    await materializeTrace(clickhouse, projectId, capture.traceId);
    return getTraceSummary(clickhouse, projectId, capture.traceId);
  }

  it.each([
    ["completed", "ok", 2, 1],
    ["failed", "error", 1, 0],
    ["cancelled", "error", 1, 0],
    // A failed attempt retried to completion; restored steps are not exported again.
    ["retried", "ok", 3, 1],
  ] as const)("materializes a %s run as %s", async (name, status, generations, tools) => {
    const capture = captures[name];
    expect(capture.phases).toHaveLength(1);

    expect(await ingest(project(), capture, 0)).toMatchObject({
      traceId: capture.traceId,
      status,
      generationCount: generations,
      toolCount: tools,
    });
  });

  it("keeps a suspended run running until its resumed attempt completes", async () => {
    const projectId = project();
    const capture = captures.approval;

    // Every span of the suspended attempt has ended, but the run is waiting for approval.
    expect(await ingest(projectId, capture, 0)).toMatchObject({ status: "running" });
    expect(await ingest(projectId, capture, 1)).toMatchObject({
      status: "ok",
      generationCount: 2,
      toolCount: 2,
    });
  });

  it("does not let an earlier suspended attempt mask a later failure", async () => {
    const projectId = project();
    const capture = captures.approvalFailed;

    expect(await ingest(projectId, capture, 0)).toMatchObject({ status: "running" });
    expect(await ingest(projectId, capture, 1)).toMatchObject({ status: "error" });
  });

  it("keeps the resumed outcome when the suspended attempt arrives late", async () => {
    const projectId = project();
    const capture = captures.approvalFailed;

    expect(await ingest(projectId, capture, 1)).toMatchObject({ status: "error" });
    expect(await ingest(projectId, capture, 0)).toMatchObject({ status: "error" });
  });

  it("roots runs ingested from SDKs that exported a placeholder parent", async () => {
    const completed = legacy(captures.completed);
    expect(await ingest(project(), completed, 0)).toMatchObject({ status: "ok" });

    const projectId = project();
    const approval = legacy(captures.approval);
    expect(await ingest(projectId, approval, 0)).toMatchObject({ status: "running" });
    expect(await ingest(projectId, approval, 1)).toMatchObject({ status: "ok" });
  });

  it("groups every run of a chat under one session with a trace per run", async () => {
    const projectId = project();
    const spans = normalize(projectId, chatSession);
    await insertSpans(clickhouse, spans);
    for (const traceId of new Set(spans.map((span) => span.traceId))) {
      await materializeTrace(clickhouse, projectId, traceId);
    }

    const sessions = await listSessions(clickhouse, projectId, { page: 1, pageSize: 25 });
    expect(
      sessions.items
        .map(({ sessionId, userId, traceCount, status }) => ({
          sessionId,
          userId,
          traceCount,
          status,
        }))
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    ).toEqual([
      // Two turns, two goal rounds, and one subagent; the resumed approval adds no trace.
      { sessionId: "chat-7f3a", userId: "user-1", traceCount: 5, status: "success" },
      { sessionId: "chat-91c2", userId: "user-2", traceCount: 1, status: "success" },
    ]);
    const chat = await getSession(clickhouse, projectId, "chat-7f3a");
    expect(chat?.traces.map((trace) => trace.status)).toEqual(Array(5).fill("ok"));
    expect(chat?.traces.every((trace) => trace.userId === "user-1")).toBe(true);
  });

  it("repairs stored placeholder-parent traces when the migration runs", async () => {
    const projectId = project();
    const capture = legacy(captures.completed);
    // Rows as stored before this release: the placeholder parent hides the root.
    const stored = normalize(projectId, capture.phases[0] ?? []).map((span) =>
      span.name === "agent.run" ? { ...span, parentSpanId: legacyParent } : span,
    );
    await insertSpans(clickhouse, stored);
    await materializeTrace(clickhouse, projectId, capture.traceId);
    expect(await getTraceSummary(clickhouse, projectId, capture.traceId)).toMatchObject({
      status: "running",
    });

    const migration = readFileSync(
      new URL("../../migrations/clickhouse/0011_anvia_run_status.sql", import.meta.url),
      "utf8",
    );
    for (const statement of migration.split(/;\s*(?:\n|$)/).filter((sql) => sql.trim())) {
      await clickhouse.command({ query: statement });
    }

    expect(await getTraceSummary(clickhouse, projectId, capture.traceId)).toMatchObject({
      status: "ok",
    });

    // A queued update has a newer ingest version, but predates the migration's wall clock.
    const updated = stored.map((span) => ({
      ...span,
      parentSpanId: span.parentSpanId === legacyParent ? null : span.parentSpanId,
      ingestVersion: (BigInt(span.ingestVersion) + 1_000_000n).toString(),
      status: "error" as const,
      spanAttributes: { ...span.spanAttributes, "anvia.run.status": "failed" },
    }));
    await insertSpans(clickhouse, updated);
    await materializeTrace(clickhouse, projectId, capture.traceId);
    expect(await getTraceSummary(clickhouse, projectId, capture.traceId)).toMatchObject({
      status: "error",
    });
  });

  it("keeps repriced costs visible without outranking a late-span materialization", async () => {
    const projectId = project();
    const [base] = normalize(projectId, captures.completed.phases[0] ?? []);
    if (base === undefined) throw new Error("Expected a captured span");
    const version = BigInt(Date.now() - 60_000) * 1_000_000n;
    const span: NormalizedSpan = {
      ...base,
      parentSpanId: null,
      observationKind: "generation",
      model: "priced-model",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 1_000_000,
      inputCost: 99,
      outputCost: 0,
      totalCost: 99,
      ingestVersion: version.toString(),
    };
    const prices = [
      {
        model: "priced-model",
        inputPricePerMillion: 4,
        cachedInputPricePerMillion: null,
        outputPricePerMillion: 0,
      },
    ];
    await insertSpans(clickhouse, [span]);
    await materializeTrace(clickhouse, projectId, span.traceId);
    await recalculateModelCosts(clickhouse, {
      projectIds: [projectId],
      prices,
      from: null,
      to: null,
    });
    expect(await getTraceSummary(clickhouse, projectId, span.traceId)).toMatchObject({
      spanCount: 1,
      totalCost: 4,
    });

    // Both versions are older than recalculation time; the late span is only one tick newer.
    await insertSpans(
      clickhouse,
      applyModelPrices(
        [
          {
            ...span,
            spanId: "f".repeat(16),
            parentSpanId: span.spanId,
            ingestVersion: (version + 1n).toString(),
          },
        ],
        prices,
      ),
    );
    await materializeTrace(clickhouse, projectId, span.traceId);
    expect(await getTraceSummary(clickhouse, projectId, span.traceId)).toMatchObject({
      spanCount: 2,
      inputTokens: 2_000_000,
      totalCost: 8,
    });
  });
});

function integrationConfig() {
  const required = ["POSTGRES_URL", "CLICKHOUSE_URL", "REDIS_URL"] as const;
  for (const key of required) {
    if (process.env[key] === undefined) throw new Error(`${key} is required for integration tests`);
  }
  return loadConfig({
    NODE_ENV: "test",
    POSTGRES_URL: process.env.POSTGRES_URL as string,
    CLICKHOUSE_URL: process.env.CLICKHOUSE_URL as string,
    REDIS_URL: process.env.REDIS_URL as string,
    LOG_LEVEL: "error",
  });
}
